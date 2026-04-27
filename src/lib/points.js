import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.join(__dirname, '..', '..', 'config', 'rules.json');

export function loadRules() {
  return JSON.parse(readFileSync(RULES_PATH, 'utf8'));
}

/**
 * 顧客・商品分類・ランクを考慮してレートを解決する
 * 優先順位: customer_rates > category_rates > tiers(ランク) > default_rate
 * @param {object} rules      loadRules() の結果
 * @param {string} customerId 顧客ID
 * @param {string} [category] 商品分類キー
 * @param {string} [tier]     顧客ランク
 * @returns {number}          適用する還元率
 */
export function resolveRate(rules, customerId, category, tier) {
  // 1. 顧客個別指定（最優先）
  if (rules.customer_rates && rules.customer_rates[customerId] != null) {
    return rules.customer_rates[customerId];
  }
  // 2. 商品分類別
  if (category && rules.category_rates && rules.category_rates[category] != null) {
    return rules.category_rates[category];
  }
  // 3. ランク別
  if (tier && rules.tiers && rules.tiers[tier]) {
    return rules.tiers[tier].rate;
  }
  // 4. デフォルト
  return rules.default_rate;
}

/**
 * 購入金額からポイントを計算する
 * @param {number} amount  税抜金額(円)
 * @param {number} rate    還元率 (0.001 = 0.1%)
 * @returns {number}       付与ポイント(整数)
 */
export function calculatePoints(amount, rate) {
  if (amount < 0) throw new Error('amount は0以上の数値である必要があります');
  return Math.floor(amount * rate);
}
