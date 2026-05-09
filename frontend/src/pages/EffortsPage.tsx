import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, InputNumber, DatePicker, Select, Space, Popconfirm, Tag, message, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { getEfforts, batchUpdateEfforts, updateEffort, deleteEffort, getUsers, getGroups, getProjects } from '../api';
import type { ActualEffort, User, Group, Project } from '../types';
import { roleLabels } from '../types';
import type { Role } from '../types';

// 强制转周一起始日（dayjs.startOf('week') 不参考 locale weekStart）
function toMonday(d: dayjs.Dayjs): dayjs.Dayjs {
  const day = d.day(); // 0=Sun
  return day === 0 ? d.subtract(6, 'day') : d.subtract(day - 1, 'day');
}

const { Title } = Typography;

const EffortsPage: React.FC = () => {
  const [efforts, setEfforts] = useState<ActualEffort[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEffort, setEditingEffort] = useState<ActualEffort | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [effortsData, usersData, groupsData, projectsData] = await Promise.all([
        getEfforts({}),
        getUsers({}),
        getGroups(),
        getProjects({}),
      ]);
      setEfforts(effortsData);
      setUsers(usersData);
      setGroups(groupsData);
      setProjects(projectsData);
    } catch {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const getGroupName = (user: User) => {
    const g = groups.find(g => g.id === user.group_id);
    if (!g) return '-';
    return g.room ? g.room + g.name : g.name;
  };

  const handleAdd = () => {
    setEditingEffort(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (r: ActualEffort) => {
    setEditingEffort(r);
    form.setFieldsValue({
      user_id: r.user_id,
      project_id: r.project_id,
      week_start_date: r.week_start_date ? toMonday(dayjs(r.week_start_date)) : null,
      actual_man_days: r.actual_man_days,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteEffort(id);
      message.success('删除成功');
      fetchData();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      console.log('[handleSubmit] raw values:', JSON.stringify(values, null, 2));
      const payload = {
        user_id: values.user_id as number,
        project_id: values.project_id as number,
        week_start_date: toMonday(values.week_start_date as dayjs.Dayjs).format('YYYY-MM-DD'),
        actual_man_days: values.actual_man_days as number,
      };
      console.log('[handleSubmit] payload:', JSON.stringify(payload, null, 2));
      if (editingEffort) {
        await updateEffort(editingEffort.id, payload);
        message.success('更新成功');
      } else {
        await batchUpdateEfforts([payload]);
        message.success('新增成功');
      }
      setModalVisible(false);
      fetchData();
    } catch (err: any) {
      console.error('操作失败详情:', err?.response?.data || err?.message || err);
      message.error('操作失败');
    }
  };

  const columns: ColumnsType<ActualEffort> = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 100 },
    { title: '姓名', dataIndex: 'user_real_name', key: 'user_real_name', width: 80 },
    {
      title: '角色',
      key: 'role',
      width: 80,
      render: (_, r) => <Tag>{roleLabels[r.role as Role] || r.role || '-'}</Tag>,
    },
    { title: '室组', dataIndex: 'group_name', key: 'group_name', width: 130, render: n => n || '-' },
    { title: '项目名称', dataIndex: 'project_name', key: 'project_name', width: 150, ellipsis: true, render: n => n || '-' },
    { title: '周期', dataIndex: 'week_label', key: 'week_label', width: 100, render: l => l || '-' },
    { title: '投入人力', dataIndex: 'actual_man_days', key: 'actual_man_days', width: 80, render: v => `${v} 人天` },
    { title: '录入人', dataIndex: 'created_by_real_name', key: 'created_by_real_name', width: 80, render: n => n || '-' },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>人员投入</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建</Button>
      </div>
      <Table
        columns={columns}
        dataSource={efforts}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        size="small"
      />
      <Modal
        title={editingEffort ? '编辑人员投入' : '新建人员投入'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="user_id" label="人员" rules={[{ required: true, message: '请选择人员' }]}>
            <Select placeholder="选择人员">
              {users.map(u => (
                <Select.Option key={u.id} value={u.id}>
                  {u.real_name}（{getGroupName(u)}）
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="project_id" label="项目" rules={[{ required: true, message: '请选择项目' }]}>
            <Select placeholder="选择项目">
              {projects.map(p => (
                <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="week_start_date" label="周期" rules={[{ required: true, message: '请选择周期' }]}>
            <DatePicker picker="week" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="actual_man_days" label="投入人力（人天）" rules={[{ required: true, message: '请输入投入人力' }]}>
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} placeholder="0.5" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EffortsPage;
