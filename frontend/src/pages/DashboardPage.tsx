import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Typography, Spin, Tag, Button, Space, Progress, Popconfirm, message } from 'antd';
import {
  ProjectOutlined, WarningOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { getDashboardSummary, getProjectsHealth, getAlerts, resolveAlert, batchResolveAlerts, getGroupManpowerOverview } from '../api';
import type { DashboardSummary, ProjectHealth, Alert } from '../types';

const { Title } = Typography;

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [health, setHealth] = useState<ProjectHealth[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [manpower, setManpower] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [s, h, a, m] = await Promise.all([
        getDashboardSummary(),
        getProjectsHealth(),
        getAlerts(),
        getGroupManpowerOverview(),
      ]);
      setSummary(s);
      setHealth(h);
      setAlerts(a);
      setManpower(m?.groups || []);
    } catch {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleResolveAlert = async (id: number) => {
    try {
      await resolveAlert(id);
      message.success('已处理');
      fetchData();
    } catch { message.error('操作失败'); }
  };

  const handleBatchResolve = async () => {
    try {
      await batchResolveAlerts(alerts.map(a => a.id));
      message.success('已全部处理');
      fetchData();
    } catch { message.error('操作失败'); }
  };

  const healthColumns: ColumnsType<ProjectHealth> = [
    { title: '项目名称', dataIndex: 'name', key: 'name', render: (n, r) => <a onClick={() => navigate(`/projects/${r.id}`)}>{n}</a> },
    { title: '类型', dataIndex: 'type', key: 'type', render: t => <Tag color={t === 'cross' ? 'purple' : 'blue'}>{t === 'cross' ? '重点项目' : '流量项目'}</Tag> },
    { title: '健康度', dataIndex: 'health_status', key: 'health_status', render: s => {
      const map = { green: { color: '#52c41a', text: '正常' }, yellow: { color: '#faad14', text: '预警' }, red: { color: '#ff4d4f', text: '超支' } };
      const m = map[s as keyof typeof map] || map.green;
      return <Tag color={m.color}>{m.text}</Tag>;
    }},
    { title: 'ST进度', key: 'st_progress', render: (_, r) => <Progress percent={r.progress.st} size="small" /> },
    { title: 'UAT进度', key: 'uat_progress', render: (_, r) => <Progress percent={r.progress.uat} size="small" /> },
    { title: '目标人天', dataIndex: 'target_man_days', key: 'target_man_days', render: v => `${v} 人天` },
    { title: '实际投入', dataIndex: 'actual_man_days', key: 'actual_man_days', render: v => `${v} 人天` },
  ];

  const alertColumns: ColumnsType<Alert> = [
    { title: '级别', dataIndex: 'alert_level', key: 'alert_level', render: l => <Tag color={l === 'red' ? 'red' : 'orange'}>{l === 'red' ? '红色' : '黄色'}</Tag> },
    { title: '类型', dataIndex: 'alert_type', key: 'alert_type', render: t => {
      const typeMap: Record<string, string> = {
        W01: '项目人力不足', W02: '个人过度负载', W04: '连续偏差>30%',
      };
      return typeMap[t] || t;
    }},
    { title: '消息', dataIndex: 'message', key: 'message' },
    { title: '操作', key: 'action', render: (_, r) => (
      <Popconfirm title="确认处理？" onConfirm={() => handleResolveAlert(r.id)}>
        <Button size="small" type="link">处理</Button>
      </Popconfirm>
    )},
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 50 }}><Spin size="large" /></div>;
  }

  const alertByLevel = summary?.alerts.by_level || {};
  const thisWeek = summary?.this_week;

  return (
    <div>
      <Title level={3}>首页</Title>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card><Statistic title="重点项目" value={summary?.projects.cross ?? 0} prefix={<ProjectOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="流量项目" value={summary?.projects.internal ?? 0} /></Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃预警"
              value={summary?.alerts.total ?? 0}
              prefix={<WarningOutlined />}
              valueStyle={{ color: (summary?.alerts.total ?? 0) > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="本周偏差"
              value={thisWeek ? `${thisWeek.variance > 0 ? '+' : ''}${thisWeek.variance}h` : '0h'}
              prefix={thisWeek && thisWeek.variance > 0 ? <ExclamationCircleOutlined /> : <CheckCircleOutlined />}
              valueStyle={{ color: thisWeek && thisWeek.variance > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 本周计划 vs 实际 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="本周人力概览">
            <Row gutter={16}>
              <Col span={12}><Statistic title="本周计划" value={thisWeek?.planned ?? 0} suffix="h" /></Col>
              <Col span={12}><Statistic title="本周实际" value={thisWeek?.actual ?? 0} suffix="h" /></Col>
            </Row>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="预警统计">
            <Space>
              <Tag color="red">红色预警 × {alertByLevel['red'] ?? 0}</Tag>
              <Tag color="orange">黄色预警 × {alertByLevel['yellow'] ?? 0}</Tag>
              {(summary?.alerts.total ?? 0) > 0 && (
                <Popconfirm title="批量处理所有预警？" onConfirm={handleBatchResolve}>
                  <Button size="small">批量处理</Button>
                </Popconfirm>
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 项目健康度 */}
      <Card title="项目健康度" style={{ marginBottom: 24 }}>
        <Table columns={healthColumns} dataSource={health} rowKey="id" pagination={{ pageSize: 10 }} size="small" />
      </Card>

      {/* 活跃预警 */}
      <Card title="活跃预警" style={{ marginBottom: 24 }}>
        <Table columns={alertColumns} dataSource={alerts} rowKey="id" pagination={{ pageSize: 10 }} size="small" />
      </Card>

      {/* 人力总览表 */}
      {manpower.length > 0 && (
        <Card title="人力总览（各组每周计划 vs 实际）" style={{ marginBottom: 24 }}>
          <Table
            dataSource={manpower}
            rowKey="group_id"
            size="small"
            pagination={false}
            columns={[
              { title: '组别', dataIndex: 'group_name', key: 'group_name', fixed: 'left' },
              ...(manpower[0]?.weeks || []).map((w: any, i: number) => ({
                title: w.week_label,
                key: `week_${i}`,
                align: 'center' as const,
                children: [
                  { title: '计划', dataIndex: ['weeks', i, 'planned'], key: `p_${i}`, render: (v: number) => `${v} 人天` },
                  { title: '实际', dataIndex: ['weeks', i, 'actual'], key: `a_${i}`, render: (v: number) => `${v} 人天` },
                  { title: '偏差', dataIndex: ['weeks', i, 'variance'], key: `v_${i}`, render: (v: number) => {
                    const color = v > 0 ? '#ff4d4f' : v < 0 ? '#52c41a' : '#999';
                    return <span style={{ color }}>{v > 0 ? `+${v} 人天` : `${v} 人天`}</span>;
                  }},
                ],
              })),
            ]}
          />
        </Card>
      )}
    </div>
  );
};

export default DashboardPage;
