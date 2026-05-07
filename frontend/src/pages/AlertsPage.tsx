import React, { useEffect, useState } from 'react';
import { Table, Button, Tag, Typography, message } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getAlerts, resolveAlert } from '../api';
import type { Alert } from '../types';

const { Title } = Typography;

const AlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAlerts = async () => {
    setLoading(true);
    try { setAlerts(await getAlerts()); }
    catch { message.error('获取预警列表失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAlerts(); }, []);

  const handleResolve = async (id: number) => {
    try { await resolveAlert(id); message.success('已解决'); fetchAlerts(); }
    catch { message.error('操作失败'); }
  };

  const columns: ColumnsType<Alert> = [
    { title: '类型', dataIndex: 'alert_type', key: 'alert_type', render: t => <Tag color={t === 'W01' ? 'blue' : t === 'W04' ? 'red' : 'orange'}>{t}</Tag> },
    { title: '消息', dataIndex: 'message', key: 'message', ellipsis: true },
    { title: '状态', dataIndex: 'status', key: 'status', render: s => <Tag color={s === 'active' ? 'red' : 'green'}>{s === 'active' ? '活跃' : '已解决'}</Tag> },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at' },
    {
      title: '操作', key: 'action',
      render: (_, r) => r.status === 'active' && <Button type="link" icon={<CheckOutlined />} onClick={() => handleResolve(r.id)}>解决</Button>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>预警列表</Title>
      </div>
      <Table columns={columns} dataSource={alerts} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
    </div>
  );
};

export default AlertsPage;
