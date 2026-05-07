#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

echo "=== 认证测试 ==="
printf "1. 后端健康检查: "
curl -s http://localhost:8000/health; echo ""

printf "2. 登录-错误密码: "
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrong"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('detail','ok'))"
echo ""

printf "3. 登录-正确密码: "
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'token_type={d[\"token_type\"]}, len={len(d[\"access_token\"])}')"
echo ""

echo "=== 项目管理 ==="
printf "4. 获取项目列表: "
curl -s http://localhost:8000/api/v1/projects -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'总数={len(d)}')"

printf "5. 创建项目: "
CREATE=$(curl -s -X POST http://localhost:8000/api/v1/projects \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test Project","description":"A test proj"}')
echo $CREATE | python3 -c "import sys,json,os;d=json.load(sys.stdin);print(f'id={d.get(\"id\")}, name={d.get(\"name\")}')"
PROJ_ID=$(echo $CREATE | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',1))")

echo "=== 周计划 ==="
printf "6. 创建周计划: "
PLAN=$(curl -s -X POST http://localhost:8000/api/v1/plans \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"project_id\":$PROJ_ID,\"title\":\"Week18\",\"week_number\":18,\"year\":2026,\"start_date\":\"2026-04-27\",\"end_date\":\"2026-05-03\"}")
echo $PLAN | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'id={d.get(\"id\")}, title={d.get(\"title\")}')"
PLAN_ID=$(echo $PLAN | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',1))")

printf "7. 获取周计划列表: "
curl -s http://localhost:8000/api/v1/plans -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'总数={len(d)}')"

echo "=== 工时记录 ==="
printf "8. 创建工时记录: "
curl -s -X POST http://localhost:8000/api/v1/efforts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"plan_id\":$PLAN_ID,\"user_id\":1,\"hours\":8.0,\"content\":\"开发\",\"work_date\":\"2026-04-28\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'id={d.get(\"id\")}, hours={d.get(\"hours\")}')"

printf "9. 获取工时列表: "
curl -s http://localhost:8000/api/v1/efforts -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'总数={len(d)}')"

echo "=== 成员与组 ==="
printf "10. 获取成员列表: "
curl -s http://localhost:8000/api/v1/members -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'总数={len(d)}')"

printf "11. 获取组列表: "
curl -s http://localhost:8000/api/v1/groups -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'总数={len(d)}')"

echo "=== Dashboard & 通知 ==="
printf "12. Dashboard摘要: "
curl -s http://localhost:8000/api/v1/dashboard/summary -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(list(d.keys()))"

printf "13. 通知列表: "
curl -s http://localhost:8000/api/v1/notifications -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'总数={len(d)}')"

echo "=== 异常场景 ==="
printf "14. 无Token访问: "
curl -s http://localhost:8000/api/v1/projects | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('detail',''))"

printf "15. 错误项目ID查详情: "
curl -s http://localhost:8000/api/v1/projects/99999 -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('detail',d))"

echo ""
echo "=== 前端 ==="
printf "16. 前端页面: "
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:5173

printf "17. 前端静态资源: "
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:5173/src/main.tsx
