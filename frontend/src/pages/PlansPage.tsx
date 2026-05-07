import React, { useEffect, useState } from 'react';
import { Table, Button, DatePicker, InputNumber, message, Card, Typography, Space, Select, Tag, Popconfirm, Tooltip } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { getPlans, batchUpdatePlans, getUsers, getProjects, getGroups } from '../api';
import type { User, Project, WeeklyPlan, Group } from '../types';
import { useAuth } from '../context/AuthContext';

const { Title } = Typography;

const PlansPage: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [weekStart, setWeekStart] = useState(dayjs().startOf('week'));
  const [editableData, setEditableData] = useState<Record<string, number>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>(undefined);

  const isManager = user?.role === 'manager';
  const isLeader = user?.role === 'leader';

  const filteredUsers = users.filter(u => {
    if (isManager) return selectedGroupId ? u.group_id === selectedGroupId : true;
    return u.group_id === user?.group_id;
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: { week_start_date: string; group_id?: number } = { week_start_date: weekStart.format('YYYY-MM-DD') };
      if (isManager && selectedGroupId) params.group_id = selectedGroupId;
      const [plansData, u, pr, g] = await Promise.all([
        getPlans(params),
        getUsers(),
        getProjects(),
        getGroups(),
      ]);
      setUsers(u);
      setProjects(pr);
      setGroups(g);
      setPlans(plansData);
      const initData: Record<string, number> = {};
      plansData.forEach(plan => {
        const key = `${plan.user_id}-${plan.project_id}`;
        initData[key] = plan.planned_man_days;
      });
      setEditableData(initData);
    } catch {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [weekStart, selectedGroupId]);

  const getVal = (userId: number, projectId: number) => {
    const key = `${userId}-${projectId}`;
    return editableData[key] ?? 0;
  };

  const setVal = (userId: number, projectId: number, val: number) => {
    const key = `${userId}-${projectId}`;
    setEditableData(prev => ({ ...prev, [key]: val }));
  };

  const getPlanStatus = (userId: number, projectId: number): WeeklyPlan['status'] | undefined => {
    return plans.find(p => p.user_id === userId && p.project_id === projectId)?.status;
  };

  const handleSave = async () => {
    const items = Object.entries(editableData).map(([key, planned_man_days]) => {
      const [user_id, project_id] = key.split('-').map(Number);
      return { user_id, project_id, week_start_date: weekStart.format('YYYY-MM-DD'), planned_man_days };
    }).filter(i => i.planned_man_days > 0);
    try {
      await batchUpdatePlans(items);
      message.success('保存成功');
      fetchData();
    } catch {
      message.error('保存失败');
    }
  };

  const statusColor: Record<string, string> = {
    draft: 'default', submitted: 'processing', approved: 'success', rejected: 'error',
  };
  const statusText: Record<string, string> = {
    draft: '草稿', submitted: '已提交', approved: '已批准', rejected: '已驳回',
  };

  const columns: ColumnsType<{ id: number; real_name: string; group_id: number | null }> = [
    { title: '室组', dataIndex: 'group_id', key: 'group_id', width: 100, fixed: 'left' as const, render: id => groups.find(g => g.id === id)?.name ?? '-' },
    { title: '员工', dataIndex: 'real_name', key: 'real_name', width: 100, fixed: 'left' as const },
    ...projects.map(p => ({
      title: (
        <Tooltip title={`目标人天: ${p.target_man_days ?? 0} 人天 | 实际投入: ${p.actual_man_days ?? 0} 人天`}>
          <span>{p.name}</span>
        </Tooltip>
      ),
      key: `proj-${p.id}`,
      width: 110,
      render: (_: unknown, record: { id: number }) => {
        const val = getVal(record.id, p.id);
        const status = getPlanStatus(record.id, p.id);
        return (
          <Space direction="vertical" size={0}>
            {isManager || isLeader ? (
              <InputNumber min={0} step={0.5} value={val} onChange={v => setVal(record.id, p.id, v ?? 0)} size="small" style={{ width: 80 }} />
            ) : val > 0 ? (
              <span>{val}</span>
            ) : null}
            {status && (
              <Tag color={statusColor[status]} style={{ fontSize: 10, lineHeight: 1.2, marginTop: 2 }}>
                {statusText[status]}
              </Tag>
            )}
          </Space>
        );
      },
    })),
  ];

  const tableData = filteredUsers.map(u => ({ id: u.id, real_name: u.real_name, group_id: u.group_id }));

  // 计算周汇总
  const totalPlanned = Object.values(editableData).reduce((sum, v) => sum + v, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>周计划</Title>
        <Space>
          {isManager && (
            <Select
              allowClear
              placeholder="选择室组"
              style={{ width: 140 }}
              value={selectedGroupId}
              onChange={v => setSelectedGroupId(v)}
              options={groups.map(g => ({ label: g.name, value: g.id }))}
            />
          )}
          <DatePicker picker="week" value={weekStart} onChange={d => d && setWeekStart(d.startOf('week'))} />
          {isManager && <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存</Button>}
          {!isManager && !isLeader && (
            <Popconfirm title="提交本周计划？" onConfirm={handleSave}>
              <Button type="primary">提交本周计划</Button>
            </Popconfirm>
          )}
        </Space>
      </div>
      <Card bodyStyle={{ padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', color: '#666' }}>
          本周计划合计：<strong>{totalPlanned} 人天</strong>
        </div>
        <Table
          columns={columns}
          dataSource={tableData}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: true }}
        />
      </Card>
    </div>
  );
};

export default PlansPage;
