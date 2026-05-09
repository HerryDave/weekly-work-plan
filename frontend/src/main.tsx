import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'dayjs/locale/zh-cn';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData';

dayjs.extend(localeData);
dayjs.locale('zh-cn');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);
