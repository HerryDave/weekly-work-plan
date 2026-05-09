import React, { useEffect, useState } from 'react';
import {
  Card, Tabs, Table, Input, Select, DatePicker,
  Button, Space, Tag, Typography, Statistic, Row, Col,
  message, Badge, Modal, Form, Divider
} from 'antd';
import {
  SaveOutlined, TeamOutlined, ProjectOutlined, EditOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  getProjectWeeklyStatus, saveProjectWeeklyStatus, getProjectWeeklyDimension
} from '../api';

const { Title, Text } = Typography;

function toMonday(d: dayjs.Dayjs): dayjs.Dayjs {
  const day = d.day();
  return day === 0 ? d.subtract(6, 'day') : d.subtract(day - 1, 'day');
}

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

type StatusRecord = {
  project_id: number;
  project_name: string;
  status: string;
  risk_desc: string;
  weekly_progress: string;
  next_week_plan: string;
  week_start_date: string;
  week_dates: string[];
  daily_allocations: Record<string, number[]>;
};

type DimDetail = {
  user_id: number;
  user_name: string;
  project_count: number;
  total_days: number;
  ratio: number;
  project_names: string[];
};

// ─── 项目情况页签 ─────────────────────────────────────────────────────────────

const ProjectStatusTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [weekStart, setWeekStart] = useState<string>(toMonday(dayjs()).format('YYYY-MM-DD'));
  const [groupId, setGroupId] = useState<number | undefined>();
  const [data, setData] = useState<{
    week_dates: string[];
    weekdays: string[];
    projects: StatusRecord[];
    all_users: { id: number; real_name: string }[];
    groups: { id: number; name: string; room?: string }[];
  } | null>(null);

  // 弹窗相关
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<StatusRecord | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await getProjectWeeklyStatus({
        week_start_date: weekStart,
        group_id: groupId,
      });
      setData(result);
    } catch {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [weekStart, groupId]);

  // 打开编辑弹窗
  const openEditModal = (project: StatusRecord) => {
    setEditingProject(project);
    form.setFieldsValue({
      status: project.status,
      risk_desc: project.risk_desc,
      weekly_progress: project.weekly_progress,
      next_week_plan: project.next_week_plan,
      daily_allocations: project.daily_allocations,
    });
    setModalVisible(true);
  };

  // 保存
  const handleSave = async () => {
    if (!editingProject) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      await saveProjectWeeklyStatus({
        project_id: editingProject.project_id,
        week_start_date: weekStart,
        status: values.status,
        risk_desc: values.risk_desc || '',
        weekly_progress: values.weekly_progress || '',
        next_week_plan: values.next_week_plan || '',
        daily_allocations: values.daily_allocations || {},
      });
      message.success('保存成功');
      setModalVisible(false);
      fetchData();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 表格列
  const columns: ColumnsType<StatusRecord> = [
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 160,
      fixed: 'left' as const,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (val: string) => {
        if (val === 'normal') return <Badge status="success" text="正常" />;
        if (val === 'risk') return <Badge status="warning" text="有风险" />;
        if (val === 'delayed') return <Badge status="error" text="已延期" />;
        return val;
      },
    },
    {
      title: '项目风险',
      dataIndex: 'risk_desc',
      key: 'risk_desc',
      width: 160,
      ellipsis: true,
    },
    {
      title: '当周进展',
      dataIndex: 'weekly_progress',
      key: 'weekly_progress',
      width: 180,
      ellipsis: true,
    },
    {
      title: '下周计划',
      dataIndex: 'next_week_plan',
      key: 'next_week_plan',
      width: 180,
      ellipsis: true,
    },
    ...WEEKDAYS.map((day, i) => ({
      title: day,
      key: `day${i + 1}`,
      width: 100,
      render: (_: any, r: StatusRecord) => {
        const userIds = r.daily_allocations[`day${i + 1}`] || [];
        if (userIds.length === 0) return <Text type="secondary">-</Text>;
        const names = userIds.map((id: number) => {
          const user = data?.all_users.find(u => u.id === id);
          return user?.real_name || '';
        }).filter(Boolean);
        return (
          <Text style={{ fontSize: 12 }}>
            {names.join(', ')}
          </Text>
        );
      },
    })),
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right' as const,
      render: (_: any, r: StatusRecord) => (
        <Button
          type="primary"
          size="small"
          icon={<EditOutlined />}
          onClick={() => openEditModal(r)}
        >
          编辑
        </Button>
      ),
    },
  ];

  const projectList = data ? data.projects : [];

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <DatePicker
          value={dayjs(weekStart)}
          onChange={d => d && setWeekStart(d.format('YYYY-MM-DD'))}
          picker="week"
          format="YYYY-MM-DD"
          placeholder="选择周"
        />
        <Select
          allowClear
          placeholder="室组筛选"
          style={{ width: 160 }}
          value={groupId}
          onChange={v => setGroupId(v)}
          options={data?.groups.map(g => ({
            label: g.room ? `${g.room} ${g.name}` : g.name,
            value: g.id,
          }))}
        />
        <Button onClick={fetchData}>刷新</Button>
      </Space>

      <Table<StatusRecord>
        columns={columns}
        dataSource={projectList}
        rowKey="project_id"
        loading={loading}
        scroll={{ x: 1000 }}
        pagination={false}
        size="small"
        bordered
      />

      {/* 编辑弹窗 */}
      <Modal
        title={`编辑项目 - ${editingProject?.project_name || ''}`}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        confirmLoading={saving}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {/* 基本信息区 */}
          <Form.Item name="status" label="项目状态" style={{ marginBottom: 12 }}>
            <Select style={{ width: 200 }}>
              <Select.Option value="normal"><Badge status="success" text="正常" /></Select.Option>
              <Select.Option value="risk"><Badge status="warning" text="有风险" /></Select.Option>
              <Select.Option value="delayed"><Badge status="error" text="已延期" /></Select.Option>
            </Select>
          </Form.Item>

          <Divider style={{ margin: '10px 0' }} />

          {/* 项目风险 */}
          <Form.Item name="risk_desc" label="项目风险" style={{ marginBottom: 12 }}>
            <Input.TextArea rows={2} placeholder="描述项目当前存在的风险..." />
          </Form.Item>

          <Divider style={{ margin: '10px 0' }} />

          {/* 当周进展 & 下周计划 并排 */}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="weekly_progress" label="当周进展" style={{ marginBottom: 12 }}>
                <Input.TextArea rows={3} placeholder="描述本周完成的工作..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="next_week_plan" label="下周计划" style={{ marginBottom: 12 }}>
                <Input.TextArea rows={3} placeholder="描述下周工作计划..." />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '10px 0' }} />

          {/* 每日人员投入：7行 */}
          <div>
            <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>每日人员投入</Text>
            {[1, 2, 3, 4, 5, 6, 7].map(day => (
              <Form.Item
                key={day}
                name={['daily_allocations', `day${day}`]}
                label={WEEKDAYS[day - 1]}
                style={{ marginBottom: 8 }}
              >
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="选择人员"
                  options={data?.all_users.map(u => ({ label: u.real_name, value: u.id }))}
                  maxTagCount={3}
                />
              </Form.Item>
            ))}
          </div>
        </Form>
      </Modal>
    </div>
  );
};

// ─── 人员维度页签 ─────────────────────────────────────────────────────────────

const PersonDimensionTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [weekStart, setWeekStart] = useState<string>(toMonday(dayjs()).format('YYYY-MM-DD'));
  const [data, setData] = useState<{
    summary: { total_projects: number; total_users: number; avg_projects_per_user: number };
    details: DimDetail[];
    analysis: string[];
  } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await getProjectWeeklyDimension({
        week_start_date: weekStart,
      });
      setData(result);
    } catch {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [weekStart]);

  const columns: ColumnsType<DimDetail> = [
    { title: '姓名', dataIndex: 'user_name', key: 'user_name', width: 100 },
    { title: '项目数', dataIndex: 'project_count', key: 'project_count', width: 80 },
    { title: '投入天数', dataIndex: 'total_days', key: 'total_days', width: 80 },
    {
      title: '投入占比',
      dataIndex: 'ratio',
      key: 'ratio',
      width: 100,
      render: (v: number) => `${(v * 100).toFixed(0)}%`,
    },
    {
      title: '参与项目',
      dataIndex: 'project_names',
      key: 'project_names',
      render: (names: string[]) => names.map((n, i) => (
        <Tag key={i} style={{ marginBottom: 2 }}>{n}</Tag>
      )),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <DatePicker
          value={dayjs(weekStart)}
          onChange={d => d && setWeekStart(d.format('YYYY-MM-DD'))}
          picker="week"
          format="YYYY-MM-DD"
          placeholder="选择周"
        />
        <Button onClick={fetchData}>刷新</Button>
      </Space>

      {data && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Statistic title="总项目数" value={data.summary.total_projects} />
          </Col>
          <Col span={8}>
            <Statistic title="总人数" value={data.summary.total_users} />
          </Col>
          <Col span={8}>
            <Statistic title="人均项目数" value={data.summary.avg_projects_per_user.toFixed(1)} />
          </Col>
        </Row>
      )}

      <Table<DimDetail>
        columns={columns}
        dataSource={data?.details || []}
        rowKey="user_id"
        loading={loading}
        pagination={false}
        size="small"
        bordered
      />
    </div>
  );
};

// ─── 主页面 ───────────────────────────────────────────────────────────────────

const ProjectWeeklyPlanPage: React.FC = () => {
  const items = [
    { key: 'project-status', label: '项目情况', children: <ProjectStatusTab /> },
    { key: 'person-dimension', label: '人员维度', children: <PersonDimensionTab /> },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>项目周报</Title>
      <Card>
        <Tabs defaultActiveKey="project-status" items={items} />
      </Card>
    </div>
  );
};

export default ProjectWeeklyPlanPage;
