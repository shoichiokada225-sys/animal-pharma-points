import 'dotenv/config';
import { createApp } from './app.js';

const port = parseInt(process.env.PORT || '3000', 10);
const app = createApp();

app.listen(port, () => {
  console.log(`✅ ポイント管理ダッシュボード起動: http://localhost:${port}`);
  console.log(`   ログインパスワード: .env の APP_PASSWORD_HASH に対応する平文`);
});
