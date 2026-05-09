import React, { useEffect, useState } from 'react';
import { Table, Typography, Select, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { getOperationLogs } from '../api';
import type { OperationLog } from '../api';

const { Title } = Typography;

const actionLabels: Record<string, string> = {
  project_create: '项目创建',
  project_update: '项目编辑',
  project_delete: '项目删除',
  project_merge: '项目合并',
};

const entityLabels: Record<string, string> = {
  project: '项目',
};

const OperationsLogPage: React.FC = () => {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | undefined>(undefined);
  const [entityType, setEntityType] = useState<string | undefined>(undefined);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await getOperationLogs({ action, entity_type: entityType });
      setLogs(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, [action, entityType]);

  const columns: ColumnsType<OperationLog> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作人',
      dataIndex: 'operator_name',
      key: 'operator_name',
      width: 100,
      render: n => n || '-',
    },
    {
      title: '操作类型',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: a => <Tag color="blue">{actionLabels[a] || a}</Tag>,
    },
    {
      title: '对象类型',
      dataIndex: 'entity_type',
      key: 'entity_type',
      width: 100,
      render: e => entityLabels[e] || e,
    },
    {
      title: '对象ID',
      dataIndex: 'entity_id',
      key: 'entity_id',
      width: 80,
    },
    {
      title: '变更详情',
      dataIndex: 'detail',
      key: 'detail',
      render: (d: string | null) => {
        if (!d) return '-';
        try {
          const parsed = JSON.parse(d);
          if (parsed.before !== null || parsed.after !== null) {
            return (
              <Space size={4}>
                {parsed.before !== null && (
                  <Tag color="red">变更前: {JSON.stringify(parsed.before)}</Tag>
                )}
                {parsed.after !== null && (
                  <Tag color="green">变更后: {JSON.stringify(parsed.after)}</Tag>
                )}
              </Space>
            );
          }
        } catch { /* not JSON */ }
        return <span style={{ color: '#666', fontSize: 12 }}>{d}</span>;
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>操作日志</Title>
        <Space>
          <Select
            placeholder="操作类型"
            allowClear
            style={{ width: 140 }}
            onChange={v => setAction(v || undefined)}
          >
            {Object.entries(actionLabels).map(([k, v]) => (
              <Select.Option key={k} value={k}>{v}</Select.Option>
            ))}
          </Select>
          <Select
            placeholder="对象类型"
            allowClear
            style={{ width: 140 }}
            onChange={v => setEntityType(v || undefined)}
          >
            {Object.entries(entityLabels).map(([k, v]) => (
              <Select.Option key={k} value={k}>{v}</Select.Option>
            ))}
          </Select>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={logs}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
};

export default OperationsLogPage;
