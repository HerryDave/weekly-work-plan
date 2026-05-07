import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Popconfirm, message, Typography, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getUsers, createUser, updateUser, deleteUser, getGroups } from '../api';
import type { User, Group, Role } from '../types';
import { roleLabels } from '../types';

const { Title } = Typography;

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    setLoading(true);
    try { setUsers(await getUsers()); }
    catch { message.error('获取用户列表失败'); }
    finally { setLoading(false); }
  };

  const fetchGroups = async () => {
    try { setGroups(await getGroups()); }
    catch { /* ignore */ }
  };

  useEffect(() => { fetchUsers(); fetchGroups(); }, []);

  const handleAdd = () => { setEditingUser(null); form.resetFields(); setModalVisible(true); };

  const handleEdit = (u: User) => {
    setEditingUser(u);
    form.setFieldsValue({ ...u, group_id: u.group_id ?? undefined });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try { await deleteUser(id); message.success('删除成功'); fetchUsers(); }
    catch { message.error('删除失败'); }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingUser) {
        const { username, password, ...rest } = values as { username: string; password?: string; real_name: string; role: string; group_id?: number };
        await updateUser(editingUser.id, rest);
        message.success('更新成功');
      } else {
        await createUser(values as { username: string; password?: string; real_name: string; role: string; group_id?: number | null });
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchUsers();
    } catch { message.error('操作失败'); }
  };

  const columns: ColumnsType<User> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '姓名', dataIndex: 'real_name', key: 'real_name' },
    { title: '角色', dataIndex: 'role', key: 'role', render: r => <Tag>{roleLabels[r as Role] || r}</Tag> },
    { title: '室组', dataIndex: 'group_id', key: 'group_id', render: id => {
      const g = groups.find(g => g.id === id);
      return g ? (g.room ? g.room + g.name : g.name) : '-';
    }},
    { title: '状态', dataIndex: 'is_active', key: 'is_active', render: v => <Tag color={v ? 'green' : 'red'}>{v ? '活跃' : '禁用'}</Tag> },
    {
      title: '操作', key: 'action', width: 150,
      render: (_, r) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
          <Popconfirm title="确定禁用？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>禁用</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>用户管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建用户</Button>
      </div>
      <Table columns={columns} dataSource={users} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
      <Modal title={editingUser ? '编辑用户' : '新建用户'} open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} okText="确定" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="用户名" disabled={!!editingUser} />
          </Form.Item>
          {!editingUser && (
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password placeholder="默认密码 123456" />
            </Form.Item>
          )}
          <Form.Item name="real_name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="真实姓名" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select placeholder="选择角色">
              <Select.Option value="manager">室经理</Select.Option>
              <Select.Option value="leader">组长</Select.Option>
              <Select.Option value="employee">员工</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="group_id" label="室组">
            <Select placeholder="选择室组（室经理可不选）" allowClear>
              {groups.map(g => <Select.Option key={g.id} value={g.id}>{g.name}</Select.Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UsersPage;
