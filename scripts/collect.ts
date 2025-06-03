#!/usr/bin/env ts-node

import { DataCollector } from '../src/collector';

/**
 * データ収集スクリプト
 * cron job や手動実行で使用
 */
async function main() {
  console.log('🚀 Starting Nostr data collection...');
  console.log(`⏰ Started at: ${new Date().toISOString()}`);

  const collector = new DataCollector();

  try {
    await collector.collectData();
    console.log('🎉 Data collection completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('💥 Data collection failed:', error);
    process.exit(1);
  }
}

// スクリプトが直接実行された場合のみ main() を実行
if (require.main === module) {
  main();
}
