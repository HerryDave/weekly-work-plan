
## 1. 项目概述
- **名称**：Workforce Weekly Planner (WWP)
- **核心目标**：室经理 + 组长管理多项目人力投入（人天），按周计划、跟踪实际、自动预警。
- **用户角色**：室经理(`manager`)、组长(`leader`)、员工(`employee`)。
- **多用户 + 组织架构**：一个室 -> 多个组 -> 多个用户。跨组项目成员由项目负责人直接添加（无需审批，仅通知对方组长）。

## 2. 技术栈（固定）
- **后端**：Python + FastAPI + SQLAlchemy (异步可选) + Alembic
- **数据库**：SQLite (开发/MVP)，MySQL (生产) – 通过配置切换
- **认证**：JWT (Bearer Token)
- **前端**：**React + Ant Design**

## 3. 数据库模型（SQLAlchemy ORM）

### 3.1 通用字段约定
所有表包含 `id` (Integer PK), `created_at` (DateTime, default=now), `updated_at` (DateTime, onupdate=now)。

### 3.2 表定义

**groups**
- id
- name (str, unique)

**users**
- id
- username (str, unique)
- password_hash (str)
- real_name (str)
- role (Enum: employee, leader, manager)
- group_id (FK -> groups.id, nullable for manager)
- is_active (bool)

**projects**
- id
- name (str)
- description (text, nullable)
- type (Enum: internal, cross)
- status (Enum: preparing, active, closed, default=preparing)
- owner_user_id (FK -> users.id) – 项目负责人，可以是任何角色
- start_date (date)
- end_date (date)

**project_members**
- id
- project_id (FK -> projects.id, cascade delete)
- user_id (FK -> users.id)
- joined_at (date, default=now)
- (project_id, user_id) unique

**project_weekly_demands** (可选预警数据)
- id
- project_id (FK -> projects.id, cascade delete)
- week_start_date (date) – 必须是周一
- required_man_days (float >0)
- (project_id, week_start_date) unique

**weekly_plans**
- id
- user_id (FK -> users.id)
- project_id (FK -> projects.id)
- week_start_date (date) – 周一
- planned_man_days (float, default=0, >=0)
- (user_id, project_id, week_start_date) unique

**actual_efforts**
- id
- user_id (FK -> users.id)
- project_id (FK -> projects.id)
- effort_date (date) – 具体某天
- actual_man_days (float, >=0)
- created_by (FK -> users.id) – 录入人
- 无唯一约束（同一天同一用户同一项目可多次录入？建议按天唯一，可简化：允许重复则取最新/累加。MVP采用先删除后插入或唯一约束)
  更简单：每个(user_id, project_id, effort_date)唯一，用INSERT OR REPLACE。

**notifications**
- id
- user_id (FK -> users.id)
- type (str: member_added, member_removed, system)
- title (str)
- content (text)
- related_entity_type (str, nullable: project, plan, etc)
- related_entity_id (int, nullable)
- is_read (bool, default=0)

**alerts**
- id
- alert_type (str: W01, W02)  – W01=项目周人力不足，W02=个人过度负载
- related_entity_type (str: project, user)
- related_entity_id (int)
- message (text)
- status (Enum: active, resolved, default=active)
- resolved_at (datetime, nullable)

## 4. 业务逻辑规则（AI需实现）

### 4.1 权限控制
- 每个请求验证JWT，获取当前用户 `current_user`。
- **全局规则**：
  - `manager`：可读写全量数据。
  - `leader`：可读写 **本组** 所有用户的计划和实际，可管理自己负责的项目成员（`owner_user_id = current_user.id`），可查看全室项目列表但仅编辑本组成员计划。
  - `employee`：只读（GET）自己的计划和实际投入，不能修改任何计划/实际。
- 实现：在API层通过 `async def get_current_user(...)` 依赖，然后在CRUD中增加 `user_id` 或 `group_id` 过滤。

### 4.2 周计划批量更新
- 前端发送数组 `[{ user_id, project_id, week_start_date, planned_man_days }]`
- 后端验证：所有操作针对的用户必须属于当前组长/经理的管辖范围（group匹配或全局）。
- 更新策略：`upsert` – 若存在则更新，否则插入。
- 触发预警检查：**W01** 和 **W02** 在计划保存后异步（或在同一请求中同步）更新预警表。

### 4.3 预警引擎
- **W01 (项目周人力不足)**：
  - 条件：某项目在某个周（`week_start_date`）的 `sum(weekly_plans.planned_man_days)` < `project_weekly_demands.required_man_days`（若需求存在）。
  - 触发时机：每次对 `weekly_plans` 中涉及该项目该周的数据进行更新后。
  - 动作：在 `alerts` 表中插入或更新（若已存在 `active` 预警则更新message；若满足条件消失则标记为 `resolved`）。
  - 推送：无需推送，用户通过预警列表查看。

- **W02 (个人过度负载)**：
  - 条件：某用户某周 `sum(weekly_plans.planned_man_days)` > 5.0（可配置，写死为5）。
  - 触发时机：更新 `weekly_plans` 后。
  - 动作：插入/更新/解决 `alerts`，`related_entity_type='user'`，`related_entity_id=user_id`。

> 注：W03/W04 为进阶，MVP不要求。

### 4.4 实际投入录入
- 组长批量录入：接受数组 `[{ user_id, project_id, effort_date, actual_man_days }]`。
- 覆盖策略：按 `(user_id, project_id, effort_date)` 唯一，使用 `INSERT OR REPLACE`。
- 录入后 **不** 自动触发预警（可选，但在报表中展示偏差）。

### 4.5 跨组项目成员管理（简化）
- 项目负责人（`owner_user_id`）可以调用 `POST /projects/{id}/members` 添加任意用户。
- 操作后自动创建 `notifications` 记录，目标用户为该被添加员工所属的组长（`users.role='leader' and group_id = 该员工的group_id`），内容：`“{员工姓名} 已被添加到项目 {项目名称}”`。
- 移除成员（`DELETE /projects/{id}/members/{user_id}`）类似发送通知。

### 4.6 组织架构管理
- 只有 `manager` 可以 `POST /groups` 和 `PUT /groups/{id}`。
- 用户管理：`manager` 可创建/编辑用户（包括设置角色、所属组）；`leader` 只能查看本组用户列表。

## 5. API 端点详细定义（AI需生成代码）

所有接口前缀：`/api/v1/`

### 5.1 认证
- `POST /auth/login`  
  Request: `{ username, password }`  
  Response: `{ access_token, token_type }`  
  (密码验证：简单比较明文？MVP可用明文或预置哈希。建议用 `passlib` 哈希，默认密码 `123456`。)

### 5.2 组管理
- `GET /groups` – 列表（manager）
- `POST /groups` – 创建（manager） `{ name }`
- `GET /groups/{id}` – 详情
- `PUT /groups/{id}` – 更新名称
- `DELETE /groups/{id}` – 删除（先检查是否有用户）

### 5.3 用户管理
- `GET /users` – 支持查询参数 `?group_id=`
  - manager : 全量或按组
  - leader : 仅本组
  - employee : 仅自己
- `POST /users` (manager) – `{ username, real_name, password, role, group_id }` (role可为employee/leader)
- `PUT /users/{id}` (manager) – 修改信息
- `DELETE /users/{id}` – 软删除（设置 is_active=False）

### 5.4 项目管理
- `GET /projects` – 根据角色返回用户可见项目（经理：所有；组长：本组参与或负责；员工：参与的项目）
- `POST /projects` – 创建项目  
  Request: `{ name, description, type, owner_user_id, start_date, end_date, status? }`  
  权限：manager 或 leader（leader创建时type只能是internal或cross，owner可以是任意人）
- `PUT /projects/{id}` – 更新（项目负责人 或 manager）
- `DELETE /projects/{id}` – 软删除？（设置status=closed即可，MVP不物理删除）

### 5.5 项目成员管理
- `GET /projects/{id}/members` – 成员列表
- `POST /projects/{id}/members` – 添加成员  
  Request: `{ user_id }`  
  权限：`owner_user_id` 或 manager  
  成功后发送通知给该成员的组长。
- `DELETE /projects/{id}/members/{user_id}` – 移除成员  
  同样发送通知给组长。

### 5.6 周计划管理
- `GET /plans` – 查询计划，支持参数：`week_start_date` (ISO日期), `user_id`, `project_id`, `group_id`  
  返回：计划列表，包含用户姓名、项目名称、计划人天。
- `POST /plans/batch` – 批量更新（upsert）  
  Request: `{ items: [{ user_id, project_id, week_start_date, planned_man_days }] }`  
  权限检查：每个 `user_id` 必须属于当前用户的管辖范围（leader: 本组；manager: 所有）。
  触发预警。

### 5.7 实际投入管理
- `GET /efforts` – 查询，参数类似 `plans`，支持 `start_date`, `end_date`。
- `POST /efforts/batch` – 批量录入/更新  
  Request: `{ items: [{ user_id, project_id, effort_date, actual_man_days }] }`  
  权限：只有 leader 或 manager 可操作，且 user_id 必须属于管辖范围。

### 5.8 预警管理
- `GET /alerts` – 获取当前用户的预警（经理看所有，组长看本组相关W02，W01按项目负责人/经理）
  - 逻辑：若当前用户为经理：返回所有active预警。  
    组长：返回W02中 `related_entity_id` 为本组成员，以及W01中 `related_entity_id` 项目负责人是组长或组长所在组参与的项目。
    员工：只返回与自己相关的W02（个人负载）。
- `PUT /alerts/{id}/resolve` – 将预警标记为已解决（设置status=resolved, resolved_at=now）

### 5.9 通知管理
- `GET /notifications` – 当前用户的通知，按时间倒序
- `PUT /notifications/{id}/read` – 标记已读
- `POST /notifications/read-all` – 全部已读

### 5.10 报表
- `GET /dashboard` – 返回仪表盘数据  
  - `total_planned_man_days_this_week` (全室总和)
  - `total_actual_man_days_this_week`
  - `group_overview`: 每个组的计划总和、实际总和
  - `alerts_unread_count` (预警未解决数)
  - 员工计划排行（前5超负载）

## 6. 非功能性要求
- **数据迁移**：使用 Alembic，启动时自动迁移。
- **跨域**：配置CORS允许任何来源（开发）。
- **错误处理**：统一返回 `{ "detail": "error message" }`，HTTP状态码规范。
- **日志**：记录关键操作（创建项目、删除成员、批量更新计划）。
- **性能**：批量更新时打开事务。

## 7. AI输出要求
请按以下顺序生成代码：

1. `requirements.txt` 包含所有依懒（fastapi, uvicorn, sqlalchemy, alembic, python-jose[cryptography], passlib[bcrypt], python-multipart）
2. 项目目录结构（使用上述5.1的结构）
3. 配置模块 `config.py` 从环境变量读取 `DATABASE_URL`（默认sqlite://./wwp.db）
4. 模型定义（`models/`）
5. 数据库迁移初始脚本（`alembic init` 后生成的版本）
6. 依赖注入 `dependencies.py`（get_current_user, get_db）
7. 认证路由 `auth.py`（登录）
8. 用户路由、组路由、项目路由、成员路由、计划路由、实际路由、预警路由、通知路由
9. 预警引擎函数（放在 `utils/alert_engine.py`，被计划更新时调用）
10. 主程序 `main.py`（包含CORS、路由注册、启动事件）

## 8. 验证用例（AI可用于自测）

- 创建经理用户，登录，创建两个组和若干用户。
- 组长登录，创建跨组项目，设置负责人为员工A。
- 员工A登录，添加成员B（另一组），检查通知是否发给B的组长。
- 组长为员工B制定周计划，填入某周计划人天6，触发W02预警。
- 经理查看预警，标记解决。
