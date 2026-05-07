import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, InputNumber, Input, message, Card, Typography, Space, Select, Tag, Popconfirm } from 'antd';
import { PlusOutlined, CheckOutlined, CloseOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getManpowerRegistrations, createManpowerRegistration, approveManpowerRegistration, rejectManpowerRegistration, deleteManpowerRegistration, getProjects, getGroups } from '../api';
import type { ManpowerRegistration, Project, Group } from '../types';
import { useAuth } from '../context/AuthContext';

const { Title } = Typography;

const ManpowerPage: React.FC = () => {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState<ManpowerRegistration[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  const isManager = user?.role === 'manager';
  const isLeader = user?.role === 'leader';

  const fetchData = async () => {
    setLoading(true);
    try {
      const [regs, pr, gr] = await Promise.all([
        getManpowerRegistrations(),
        getProjects(),
        getGroups(),
      ]);
      setRegistrations(regs);
      setProjects(pr);
      setGroups(gr);
    } catch {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await createManpowerRegistration(values);
      message.success('创建成功');
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch { message.error('创建失败'); }
  };

  const handleApprove = async (id: number) => {
    try {
      await approveManpowerRegistration(id);
      message.success('已批准');
      fetchData();
    } catch { message.error('操作失败'); }
  };

  const handleReject = async (id: number) => {
    try {
      await rejectManpowerRegistration(id);
      message.success('已驳回');
      fetchData();
    } catch { message.error('操作失败'); }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteManpowerRegistration(id);
      message.success('已删除');
      fetchData();
    } catch { message.error('删除失败'); }
  };

  const statusMap: Record<string, { color: string; text: string }> = {
    pending: { color: 'processing', text: '待审批' },
    approved: { color: 'success', text: '已批准' },
    rejected: { color: 'error', text: '已驳回' },
  };

  const columns: ColumnsType<ManpowerRegistration> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '项目', dataIndex: 'project_name', key: 'project_name', render: n => n || '-' },
    { title: '团队', dataIndex: 'team_name', key: 'team_name', render: n => n || '-' },
    { title: '申报人天', dataIndex: 'registered_man_days', key: 'registered_man_days', render: v => `${v} 人天` },
    { title: '说明', dataIndex: 'note', key: 'note', render: n => n || '-' },
    { title: '申请人', dataIndex: 'applicant_name', key: 'applicant_name', render: n => n || '-' },
    {
      title: '状态',
      key: 'status',
      render: (_, r) => {
        const s = statusMap[r.status] || statusMap.pending;
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, r) => (
        <Space>
          {r.status === 'pending' && (isManager || isLeader) && (
            <>
              <Popconfirm title="批准此报备？" onConfirm={() => handleApprove(r.id)}>
                <Button type="link" size="small" icon={<CheckOutlined />} style={{ color: '#52c41a' }}>批准</Button>
              </Popconfirm>
              <Popconfirm title="驳回此报备？" onConfirm={() => handleReject(r.id)}>
                <Button type="link" size="small" icon={<CloseOutlined />} danger>驳回</Button>
              </Popconfirm>
            </>
          )}
          {(isManager || r.applicant_id === user?.id) && r.status === 'pending' && (
            <Popconfirm title="删除此报备？" onConfirm={() => handleDelete(r.id)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>人力报备</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>新建报备</Button>
      </div>
      <Card bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={registrations}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
      <Modal
        title="新建人力报备"
        open={modalVisible}
        onOk={handleCreate}
        onCancel={() => { setModalVisible(false); form.resetFields(); }}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="project_id" label="项目" rules={[{ required: true }]}>
            <Select placeholder="选择项目">
              {projects.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="team_id" label="团队" rules={[{ required: true }]}>
            <Select placeholder="选择团队">
              {groups.map(g => <Select.Option key={g.id} value={g.id}>{g.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="registered_man_days" label="申报人天" rules={[{ required: true }]}>
            <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} placeholder="输入人天" />
          </Form.Item>
          <Form.Item name="note" label="说明">
            <Input.TextArea rows={2} placeholder="简要说明报备原因" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ManpowerPage;
