import React, { useEffect, useState } from 'react';
import { Card, Descriptions, Table, Button, Space, Select, message, Popconfirm, Tabs, Progress, InputNumber, Tag, Row, Col, Statistic } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useParams, useNavigate } from 'react-router-dom';
import { getProjects, getProjectMembers, addProjectMember, removeProjectMember, getUsers, updateProject, getProjectVariance } from '../api';
import type { Project, ProjectMember, User, ProjectVariance } from '../types';


const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [stProgress, setStProgress] = useState(0);
  const [uatProgress, setUatProgress] = useState(0);
  const [variance, setVariance] = useState<ProjectVariance | null>(null);
  const [activeTab, setActiveTab] = useState('info');

  const fetchProject = async () => {
    if (!id) return;
    try {
      const all = await getProjects();
      const p = all.find(x => x.id === parseInt(id));
      if (p) {
        setProject(p);
        setStProgress(p.st_progress || 0);
        setUatProgress(p.uat_progress || 0);
      }
    } catch {
      message.error('获取项目详情失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchVariance = async () => {
    if (!id) return;
    try {
      const v = await getProjectVariance(parseInt(id));
      setVariance(v);
    } catch { /* ignore */ }
  };

  const fetchMembers = async () => {
    if (!id) return;
    try { setMembers(await getProjectMembers(parseInt(id))); }
    catch { /* ignore */ }
  };

  const fetchAllUsers = async () => {
    try { setAllUsers(await getUsers()); }
    catch { /* ignore */ }
  };

  useEffect(() => {
    if (!id) return;
    fetchProject();
    fetchMembers();
    fetchAllUsers();
  }, [id]);

  const handleSaveProgress = async () => {
    if (!id) return;
    try {
      await updateProject(parseInt(id), { st_progress: stProgress, uat_progress: uatProgress });
      message.success('进度已更新');
      fetchProject();
    } catch { message.error('保存失败'); }
  };

  const handleRemoveMember = async (userId: number) => {
    if (!id) return;
    try { await removeProjectMember(parseInt(id), userId); message.success('移除成功'); fetchMembers(); }
    catch { message.error('移除失败'); }
  };

  const handleAddMember = async () => {
    if (!id || !selectedUserId) return;
    try {
      await addProjectMember(parseInt(id), selectedUserId);
      message.success('添加成功');
      setAddMemberVisible(false);
      setSelectedUserId(null);
      fetchMembers();
    } catch { message.error('添加失败'); }
  };

  const memberColumns: ColumnsType<ProjectMember> = [
    { title: '姓名', dataIndex: 'real_name', key: 'real_name' },
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '组', dataIndex: 'group_name', key: 'group_name' },
    { title: '加入时间', dataIndex: 'joined_at', key: 'joined_at' },
    {
      title: '操作', key: 'action',
      render: (_, r) => (
        <Popconfirm title="确定移除？" onConfirm={() => handleRemoveMember(r.user_id)}>
          <Button type="link" danger icon={<DeleteOutlined />}>移除</Button>
        </Popconfirm>
      ),
    },
  ];

  const availableUsers = allUsers.filter(u => !members.some(m => m.user_id === u.id));

  if (loading) return <div style={{ textAlign: 'center', padding: 50 }}>加载中...</div>;
  if (!project) return null;

  const statusMap: Record<string, string> = { preparing: '筹备中', active: '进行中', closed: '已结项' };

  const tabItems = [
    {
      key: 'info',
      label: '项目信息',
      children: (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Descriptions title="基本信息" bordered column={2}>
              <Descriptions.Item label="名称">{project.name}</Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag color={project.type === 'cross' ? 'purple' : 'blue'}>
                  {project.type === 'internal' ? '流量项目' : '重点项目'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">{statusMap[project.status] ?? project.status}</Descriptions.Item>
              <Descriptions.Item label="负责人">{project.owner_real_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="开始日期">{project.start_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="结束日期">{project.end_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{project.description || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
          <Card title="人力概览" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={6}>
                <Statistic title="目标人天" value={project.target_man_days ?? 0} suffix="人天" />
              </Col>
              <Col span={6}>
                <Statistic title="实际投入" value={project.actual_man_days ?? 0} suffix="人天" />
              </Col>
              <Col span={6}>
                <Statistic
                  title="剩余人天"
                  value={Math.max(0, (project.target_man_days ?? 0) - (project.actual_man_days ?? 0))}
                  suffix="h"
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="消耗比例"
                  value={project.target_man_days ? Math.round(((project.actual_man_days ?? 0) / project.target_man_days) * 100) : 0}
                  suffix="%"
                  valueStyle={{ color: project.target_man_days && (project.actual_man_days ?? 0) / project.target_man_days >= 1 ? '#ff4d4f' : project.target_man_days && (project.actual_man_days ?? 0) / project.target_man_days >= 0.8 ? '#faad14' : '#52c41a' }}
                />
              </Col>
            </Row>
          </Card>
          <Card title="进度录入" style={{ marginBottom: 16 }}>
            <Row gutter={16} align="middle">
              <Col span={4}>
                <span>ST进度：</span>
                <InputNumber min={0} max={100} value={stProgress} onChange={v => setStProgress(v ?? 0)} addonAfter="%" style={{ width: 100 }} />
              </Col>
              <Col span={4}>
                <span>UAT进度：</span>
                <InputNumber min={0} max={100} value={uatProgress} onChange={v => setUatProgress(v ?? 0)} addonAfter="%" style={{ width: 100 }} />
              </Col>
              <Col span={4}>
                <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveProgress}>保存进度</Button>
              </Col>
            </Row>
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={12}><Progress percent={stProgress} size="small" />ST 进度</Col>
              <Col span={12}><Progress percent={uatProgress} size="small" />UAT 进度</Col>
            </Row>
          </Card>
          <Card title="项目成员" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setAddMemberVisible(true)}>添加成员</Button>}>
            <Table columns={memberColumns} dataSource={members} rowKey="id" pagination={false} />
          </Card>
          {addMemberVisible && (
            <Card style={{ marginTop: 16 }}>
              <Space.Compact style={{ width: '100%' }}>
                <Select placeholder="选择用户" value={selectedUserId} onChange={setSelectedUserId} style={{ flex: 1 }}>
                  {availableUsers.map(u => <Select.Option key={u.id} value={u.id}>{u.real_name} ({u.username})</Select.Option>)}
                </Select>
                <Button type="primary" onClick={handleAddMember}>确认</Button>
                <Button onClick={() => { setAddMemberVisible(false); setSelectedUserId(null); }}>取消</Button>
              </Space.Compact>
            </Card>
          )}
        </>
      ),
    },
    {
      key: 'variance',
      label: '差异分析',
      children: (
        <Card>
          {variance ? (
            <>
              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={6}><Statistic title="总计划" value={variance.summary.total_planned} suffix="人天" /></Col>
                <Col span={6}><Statistic title="总实际" value={variance.summary.total_actual} suffix="人天" /></Col>
                <Col span={6}>
                  <Statistic
                    title="总偏差"
                    value={variance.summary.total_variance > 0 ? `+${variance.summary.total_variance}` : variance.summary.total_variance}
                    suffix="人天"
                    valueStyle={{ color: variance.summary.total_variance > 0 ? '#ff4d4f' : '#52c41a' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="偏差率"
                    value={variance.summary.total_variance_pct != null ? `${variance.summary.total_variance_pct > 0 ? '+' : ''}${variance.summary.total_variance_pct}` : 0}
                    suffix="%"
                    valueStyle={{ color: variance.summary.total_variance_pct != null && variance.summary.total_variance_pct > 0 ? '#ff4d4f' : '#52c41a' }}
                  />
                </Col>
              </Row>
              <Table
                size="small"
                dataSource={variance.weekly.map(w => ({ ...w, key: w.week_start }))}
                columns={[
                  { title: '周', dataIndex: 'week_label', key: 'week_label' },
                  { title: '计划', dataIndex: 'planned', key: 'planned', render: v => `${v} 人天` },
                  { title: '实际', dataIndex: 'actual', key: 'actual', render: v => `${v} 人天` },
                  { title: '偏差', dataIndex: 'variance', key: 'variance', render: v => v > 0 ? <span style={{ color: '#ff4d4f' }}>+{v}</span> : v < 0 ? <span style={{ color: '#52c41a' }}>{v}</span> : v },
                  { title: '偏差率', dataIndex: 'variance_pct', key: 'variance_pct', render: v => v != null ? `${v > 0 ? '+' : ''}${v}%` : '-' },
                  { title: '状态', dataIndex: 'status', key: 'status', render: s => {
                    const map = { over: { color: 'red', text: '超支' }, under: { color: 'green', text: '节省' }, on_track: { color: 'blue', text: '正常' } };
                    const m = map[s as keyof typeof map] || map.on_track;
                    return <Tag color={m.color}>{m.text}</Tag>;
                  }},
                ]}
                pagination={false}
              />
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无数据</div>
          )}
        </Card>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>返回</Button>
        <Button onClick={() => { setActiveTab('variance'); fetchVariance(); }}>查看差异分析</Button>
      </Space>
      <Tabs activeKey={activeTab} onChange={k => { setActiveTab(k); if (k === 'variance') fetchVariance(); }} items={tabItems} />
    </div>
  );
};

export default ProjectDetailPage;
