import { formatEther, parseEther } from 'ethers';

/**
 * Token Units Utility - 统一处理 wei 单位转换
 * 
 * 后端存储所有代币数量为 wei（string 格式）
 * 前端使用这些工具函数进行转换和计算
 */

/**
 * 将 wei 字符串转换为人类可读的代币数量
 * @param weiString - wei 格式的代币数量（字符串）
 * @param decimals - 小数位数（默认 18）
 * @returns 人类可读的数字
 */
export function parseTokenAmount(weiString: string | null | undefined, decimals: number = 18): number {
  if (!weiString || weiString === '0') return 0;
  
  try {
    return Number(formatEther(weiString));
  } catch {
    return 0;
  }
}

/**
 * 格式化 wei 字符串为指定小数位的代币字符串
 * @param weiString - wei 格式的代币数量
 * @param decimalPlaces - 显示的小数位数
 * @returns 格式化的字符串
 */
export function formatTokenAmount(weiString: string | null | undefined, decimalPlaces: number = 2): string {
  const amount = parseTokenAmount(weiString);
  return amount.toFixed(decimalPlaces);
}

/**
 * 计算代币百分比（使用 BigInt 避免精度问题）
 * @param tokenWei - 部分代币数量（wei）
 * @param totalWei - 总代币数量（wei）
 * @returns 百分比（0-100）
 */
export function percentageOf(tokenWei: string | null | undefined, totalWei: string | null | undefined): number {
  if (!tokenWei || !totalWei || tokenWei === '0' || totalWei === '0') return 0;
  
  try {
    const tokenBigInt = BigInt(tokenWei);
    const totalBigInt = BigInt(totalWei);
    
    if (totalBigInt === BigInt(0)) return 0;
    
    // 使用 BigInt 计算百分比（精度到小数点后 2 位）
    const percentage = Number(tokenBigInt * BigInt(10000) / totalBigInt) / 100;
    return percentage;
  } catch {
    return 0;
  }
}

/**
 * 对 wei 字符串数组求和（使用 BigInt）
 * @param weiStrings - wei 字符串数组
 * @returns wei 字符串总和
 */
export function sumWei(weiStrings: (string | null | undefined)[]): string {
  const total = weiStrings.reduce((sum, wei) => {
    if (!wei || wei === '0') return sum;
    try {
      return sum + BigInt(wei);
    } catch {
      return sum;
    }
  }, BigInt(0));
  
  return total.toString();
}

/**
 * 比较两个 wei 字符串的大小
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareWei(a: string | null | undefined, b: string | null | undefined): number {
  const aBigInt = BigInt(a || '0');
  const bBigInt = BigInt(b || '0');
  
  if (aBigInt < bBigInt) return -1;
  if (aBigInt > bBigInt) return 1;
  return 0;
}

/**
 * 将人类可读的代币数量转换为 wei 字符串
 * @param tokenAmount - 代币数量（number）
 * @returns wei 字符串
 */
export function toWei(tokenAmount: number): string {
  return parseEther(tokenAmount.toString()).toString();
}

/**
 * 检查 wei 字符串是否为零或无效
 */
export function isZeroOrInvalid(weiString: string | null | undefined): boolean {
  if (!weiString) return true;
  try {
    return BigInt(weiString) === BigInt(0);
  } catch {
    return true;
  }
}
