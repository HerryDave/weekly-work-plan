import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Space, Popconfirm, message, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getGroups, createGroup, updateGroup, deleteGroup } from '../api';
import type { Group } from '../types';

const { Title } = Typography;

const GroupsPage: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [form] = Form.useForm();

  const fetchGroups = async () => {
    setLoading(true);
    try {
      setGroups(await getGroups());
    } catch {
      message.error('获取组列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGroups(); }, []);

  const handleAdd = () => {
    setEditingGroup(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (g: Group) => {
    setEditingGroup(g);
    form.setFieldsValue({ room: g.room || '', name: g.name });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteGroup(id);
      message.success('删除成功');
      fetchGroups();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingGroup) {
        await updateGroup(editingGroup.id, { room: values.room, name: values.name });
        message.success('更新成功');
      } else {
        await createGroup({ room: values.room, name: values.name });
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchGroups();
    } catch {
      message.error('操作失败');
    }
  };

  const columns: ColumnsType<Group> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    { title: '室', dataIndex: 'room', key: 'room', render: (r: string) => r || '-' },
    {
      title: '组名', dataIndex: 'name', key: 'name',
      render: (n: string, r: Group) => r.room ? `${r.room}${n}` : n,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, r: Group) => (
        <Space>
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
        <Title level={3} style={{ margin: 0 }}>组管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建组</Button>
      </div>
      <Table columns={columns} dataSource={groups} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
      <Modal title={editingGroup ? '编辑组' : '新建组'} open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} okText="确定" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="room" label="室" extra="如：设计室、一组" rules={[{ required: true, message: '请输入室名' }]}>
            <Input placeholder="请输入室名，如：设计室" />
          </Form.Item>
          <Form.Item name="name" label="组名" rules={[{ required: true, message: '请输入组名' }]}>
            <Input placeholder="请输入组名，如：一组" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default GroupsPage;
