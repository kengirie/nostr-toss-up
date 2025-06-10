const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// ファイルからnpubキーを読み込む
const filePath = path.join(__dirname, 'existing-users.txt');
const fileContent = fs.readFileSync(filePath, 'utf8');
const pubkeys = fileContent.split('\n').filter(line => line.trim().startsWith('npub'));

// 現在の日時を取得（YYYY-MM-DD形式）
const today = new Date().toISOString().split('T')[0];

console.log(`${pubkeys.length}件のpubkeyを処理します...`);

// 各pubkeyをデータベースに挿入
pubkeys.forEach((pubkey, index) => {
  // 行番号と空白を削除
  const cleanPubkey = pubkey.replace(/^\d+\s+\|\s+/, '').trim();

  if (cleanPubkey) {
    try {
      // wranglerコマンドを実行してデータベースに挿入
      const command = `npx wrangler d1 execute nostr-toss-up-db --command="INSERT OR IGNORE INTO users (pubkey, registration_date, existing_user) VALUES ('${cleanPubkey}', '${today}', 1)"`;

      execSync(command);

      if ((index + 1) % 10 === 0 || index === pubkeys.length - 1) {
        console.log(`${index + 1}/${pubkeys.length} 件処理しました`);
      }
    } catch (error) {
      console.error(`エラー (${cleanPubkey}): ${error.message}`);
    }
  }
});

console.log('インポート完了！');
