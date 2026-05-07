import React, { useEffect, useState } from 'react';
import { Form, Input, Button, Table, Space, Modal, message, Typography, Select, Tag, Progress, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { getProjects, createProject, updateProject, deleteProject, getUsers, getGroups } from '../api';
import type { Project, User, Group } from '../types';

const { Title } = Typography;

const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const fetchProjects = async () => {
    setLoading(true);
    try { setProjects(await getProjects()); }
    catch { message.error('获取项目列表失败'); }
    finally { setLoading(false); }
  };

  const fetchUsers = async () => {
    try { setUsers(await getUsers()); }
    catch { /* ignore */ }
  };

  const fetchGroups = async () => {
    try { setGroups(await getGroups()); }
    catch { /* ignore */ }
  };

  useEffect(() => { fetchProjects(); fetchUsers(); fetchGroups(); }, []);

  const handleAdd = () => {
    setEditingProject(null);
    form.resetFields();
    form.setFieldsValue({ status: 'preparing', type: 'internal' });
    setModalVisible(true);
  };

  const handleEdit = (p: Project) => {
    setEditingProject(p);
    form.setFieldsValue(p);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteProject(id);
      message.success('删除成功');
      fetchProjects();
    } catch { message.error('删除失败'); }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingProject) {
        await updateProject(editingProject.id, values);
        message.success('更新成功');
      } else {
        await createProject(values as Parameters<typeof createProject>[0]);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchProjects();
    } catch { message.error('操作失败'); }
  };

  const statusMap: Record<string, { color: string; text: string }> = {
    preparing: { color: 'blue', text: '筹备中' },
    active: { color: 'green', text: '进行中' },
    closed: { color: 'default', text: '已结项' },
  };

  const columns: ColumnsType<Project> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '项目名称', dataIndex: 'name', key: 'name' },
    { title: '类型', dataIndex: 'type', key: 'type', render: t => <Tag>{t === 'internal' ? '组内' : '跨组'}</Tag> },
    { title: '状态', dataIndex: 'status', key: 'status', render: s => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text}</Tag> },
    { title: '负责人', dataIndex: 'owner_real_name', key: 'owner_real_name', render: n => n || '-' },
    { title: '室组', dataIndex: 'group_name', key: 'group_name', render: n => n || '-' },
    {
      title: '进度',
      key: 'progress',
      width: 120,
      render: (_, r) => (
        <Progress
          percent={r.progress || 0}
          size="small"
          status={r.progress !== undefined && r.progress >= 100 ? 'success' : undefined}
        />
      ),
    },
    { title: '开始日期', dataIndex: 'start_date', key: 'start_date', render: d => d || '-' },
    { title: '结束日期', dataIndex: 'end_date', key: 'end_date', render: d => d || '-' },
    {
      title: '目标投入',
      key: 'target_man_days',
      render: (_, r) => `${r.target_man_days ?? 0} 人天`,
    },
    {
      title: '实际投入',
      key: 'actual_man_days',
      render: (_, r) => `${r.actual_man_days ?? 0} 人天`,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, r) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/projects/${r.id}`)}>详情</Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>项目管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建项目</Button>
      </div>
      <Table columns={columns} dataSource={projects} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
      <Modal title={editingProject ? '编辑项目' : '新建项目'} open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} okText="确定" cancelText="取消" width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="项目名称" rules={[{ required: true }]}>
            <Input placeholder="项目名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="type" label="项目类型" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="internal">组内项目</Select.Option>
              <Select.Option value="cross">跨组项目</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="group_id" label="室组">
            <Select placeholder="选择室组" allowClear>
              {groups.map(g => <Select.Option key={g.id} value={g.id}>{g.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="owner_user_id" label="负责人" rules={[{ required: true }]}>
            <Select placeholder="选择负责人">
              {users.map(u => <Select.Option key={u.id} value={u.id}>{u.real_name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="preparing">
            <Select>
              <Select.Option value="preparing">筹备中</Select.Option>
              <Select.Option value="active">进行中</Select.Option>
              <Select.Option value="closed">已结项</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="start_date" label="开始日期" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="end_date" label="结束日期" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectsPage;
