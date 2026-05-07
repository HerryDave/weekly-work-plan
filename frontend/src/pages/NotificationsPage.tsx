import React, { useEffect, useState } from 'react';
import { Table, Button, Tag, Typography, message } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api';
import type { Notification } from '../types';

const { Title } = Typography;

const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    setLoading(true);
    try { setNotifications(await getNotifications()); }
    catch { message.error('获取通知列表失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchNotifications(); }, []);

  const handleRead = async (id: number) => {
    try { await markNotificationRead(id); message.success('已标记'); fetchNotifications(); }
    catch { message.error('操作失败'); }
  };

  const handleReadAll = async () => {
    try { await markAllNotificationsRead(); message.success('已全部标记'); fetchNotifications(); }
    catch { message.error('操作失败'); }
  };

  const columns: ColumnsType<Notification> = [
    { title: '类型', dataIndex: 'type', key: 'type', render: t => <Tag>{t === 'member_added' ? '成员添加' : t === 'member_removed' ? '成员移除' : '系统'}</Tag> },
    { title: '标题', dataIndex: 'title', key: 'title' },
    { title: '内容', dataIndex: 'content', key: 'content', ellipsis: true },
    { title: '时间', dataIndex: 'created_at', key: 'created_at' },
    { title: '状态', dataIndex: 'is_read', key: 'is_read', render: r => <Tag color={r ? 'default' : 'blue'}>{r ? '已读' : '未读'}</Tag> },
    {
      title: '操作', key: 'action',
      render: (_, r) => !r.is_read && <Button type="link" icon={<CheckOutlined />} onClick={() => handleRead(r.id)}>标记已读</Button>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>通知中心</Title>
        <Button onClick={handleReadAll}>全部已读</Button>
      </div>
      <Table columns={columns} dataSource={notifications} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
    </div>
  );
};

export default NotificationsPage;
