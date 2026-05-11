-- 周计划管理平台 MySQL 建表脚本
-- 由 SQLite schema 转换而来

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for groups
-- ----------------------------
CREATE TABLE `groups` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `room` VARCHAR(100),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_group_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for users
-- ----------------------------
CREATE TABLE `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `real_name` VARCHAR(100) NOT NULL,
  `role` VARCHAR(8) NOT NULL,
  `group_id` INT,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_username` (`username`),
  KEY `fk_user_group` (`group_id`),
  CONSTRAINT `fk_user_group` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for projects
-- ----------------------------
CREATE TABLE `projects` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `task_code` VARCHAR(50),
  `name` VARCHAR(200) NOT NULL,
  `description` VARCHAR(1000),
  `type` VARCHAR(8) DEFAULT 'internal',
  `status` VARCHAR(9) DEFAULT 'preparing',
  `owner_user_id` INT NOT NULL,
  `group_id` INT,
  `start_date` DATE,
  `end_date` DATE,
  `st_progress` FLOAT DEFAULT 0.0,
  `uat_progress` FLOAT DEFAULT 0.0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_project_owner` (`owner_user_id`),
  KEY `fk_project_group` (`group_id`),
  CONSTRAINT `fk_project_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_project_group` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for project_members
-- ----------------------------
CREATE TABLE `project_members` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `project_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `joined_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_member` (`project_id`, `user_id`),
  KEY `fk_pm_project` (`project_id`),
  KEY `fk_pm_user` (`user_id`),
  CONSTRAINT `fk_pm_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `fk_pm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for project_weekly_demands
-- ----------------------------
CREATE TABLE `project_weekly_demands` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `project_id` INT NOT NULL,
  `week_start_date` DATE NOT NULL,
  `required_man_days` FLOAT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_week_demand` (`project_id`, `week_start_date`),
  KEY `fk_pwd_project` (`project_id`),
  CONSTRAINT `fk_pwd_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for weekly_plans
-- ----------------------------
CREATE TABLE `weekly_plans` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `project_id` INT NOT NULL,
  `week_start_date` DATE NOT NULL,
  `planned_man_days` FLOAT DEFAULT 0.0,
  `team_id` INT,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_project_week` (`user_id`, `project_id`, `week_start_date`),
  KEY `fk_wp_user` (`user_id`),
  KEY `fk_wp_project` (`project_id`),
  KEY `fk_wp_team` (`team_id`),
  CONSTRAINT `fk_wp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_wp_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `fk_wp_team` FOREIGN KEY (`team_id`) REFERENCES `groups` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for notifications
-- ----------------------------
CREATE TABLE `notifications` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `content` VARCHAR(1000) NOT NULL,
  `related_entity_type` VARCHAR(50),
  `related_entity_id` INT,
  `is_read` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_notif_user` (`user_id`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for manpower_registrations
-- ----------------------------
CREATE TABLE `manpower_registrations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `project_id` INT NOT NULL,
  `team_id` INT NOT NULL,
  `registered_man_days` FLOAT NOT NULL DEFAULT 0.0,
  `notes` TEXT,
  `status` VARCHAR(20) DEFAULT 'pending',
  `created_by` INT NOT NULL,
  `approved_by` INT,
  `approved_at` DATETIME,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_team` (`project_id`, `team_id`),
  KEY `fk_mr_project` (`project_id`),
  KEY `fk_mr_team` (`team_id`),
  KEY `fk_mr_created_by` (`created_by`),
  KEY `fk_mr_approved_by` (`approved_by`),
  CONSTRAINT `fk_mr_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `fk_mr_team` FOREIGN KEY (`team_id`) REFERENCES `groups` (`id`),
  CONSTRAINT `fk_mr_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_mr_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_mr_status` CHECK (`status` IN ('pending', 'approved', 'rejected'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for operation_logs
-- ----------------------------
CREATE TABLE `operation_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `operator_id` INT NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `entity_type` VARCHAR(50) NOT NULL,
  `entity_id` INT NOT NULL,
  `detail` TEXT,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_op_operator` (`operator_id`),
  CONSTRAINT `fk_op_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for alerts
-- ----------------------------
CREATE TABLE `alerts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `alert_type` VARCHAR(20) NOT NULL,
  `alert_level` VARCHAR(10) DEFAULT 'yellow',
  `related_entity_type` VARCHAR(50) NOT NULL,
  `related_entity_id` TEXT NOT NULL,
  `message` VARCHAR(500) NOT NULL,
  `status` VARCHAR(20) DEFAULT 'active',
  `resolved_at` DATETIME,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for actual_efforts
-- ----------------------------
CREATE TABLE `actual_efforts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `project_id` INT NOT NULL,
  `week_start_date` DATE NOT NULL,
  `actual_man_days` FLOAT NOT NULL DEFAULT 0.0,
  `team_id` INT,
  `created_by` INT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_project_week` (`user_id`, `project_id`, `week_start_date`),
  KEY `fk_ae_user` (`user_id`),
  KEY `fk_ae_project` (`project_id`),
  KEY `fk_ae_team` (`team_id`),
  KEY `fk_ae_created_by` (`created_by`),
  CONSTRAINT `fk_ae_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_ae_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `fk_ae_team` FOREIGN KEY (`team_id`) REFERENCES `groups` (`id`),
  CONSTRAINT `fk_ae_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for project_weekly_status
-- ----------------------------
CREATE TABLE `project_weekly_status` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `project_id` INT NOT NULL,
  `week_start_date` DATE NOT NULL,
  `status` VARCHAR(20) DEFAULT 'normal',
  `risk_desc` VARCHAR(500),
  `weekly_progress` VARCHAR(500),
  `next_week_plan` VARCHAR(500),
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_week_status` (`project_id`, `week_start_date`),
  KEY `fk_pws_project` (`project_id`),
  KEY `idx_pws_week` (`week_start_date`),
  CONSTRAINT `fk_pws_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for project_weekly_member_allocation
-- ----------------------------
CREATE TABLE `project_weekly_member_allocation` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `project_weekly_status_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `weekday` INT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pwma` (`project_weekly_status_id`, `user_id`, `weekday`),
  KEY `fk_pwma_status` (`project_weekly_status_id`),
  KEY `fk_pwma_user` (`user_id`),
  CONSTRAINT `fk_pwma_status` FOREIGN KEY (`project_weekly_status_id`) REFERENCES `project_weekly_status` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pwma_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- Table structure for alembic_version (optional)
-- ----------------------------
CREATE TABLE `alembic_version` (
  `version_num` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ================================
-- 初始化数据
-- ================================
-- admin 密码: 123456 (bcrypt hash)
INSERT INTO `users` (`username`, `password_hash`, `real_name`, `role`, `is_active`) VALUES
('admin', '$2b$12$suUGLTEHXBNqxkIboExieOPnw6qWh2OeYziQ2rHJC5uGvz6C/C0QS', '管理员', 'manager', 1),
('zhangsan', '$2b$12$suUGLTEHXBNqxkIboExieOPnw6qWh2OeYziQ2rHJC5uGvz6C/C0QS', '张三', 'leader', 1),
('lisi', '$2b$12$suUGLTEHXBNqxkIboExieOPnw6qWh2OeYziQ2rHJC5uGvz6C/C0QS', '李四', 'employee', 1);

INSERT INTO `groups` (`name`, `room`) VALUES
('研发组', '深圳'),
('产品组', '深圳');

-- 初始 alert 配置
INSERT INTO `alerts` (`alert_type`, `alert_level`, `related_entity_type`, `related_entity_id`, `message`, `status`) VALUES
('weekly_report', 'yellow', 'project_weekly_status', '0', '请填写项目周报', 'active');

