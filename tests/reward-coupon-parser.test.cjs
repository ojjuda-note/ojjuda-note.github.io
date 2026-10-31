'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parseCouponText}=require('../admin/reward-coupon-parser.js');

test('Typical Korean coupons: labeled code, expiry, and unrelated field dates',()=>{
 const result=parseCouponText('편의점 상품권 5,000원\n구매일: 2026.10.01\n쿠폰번호 1234 5678 9012 3456\n유효기간: 2026.12.31\n고객센터 1588-1234');
 assert.deepEqual(result,{code:'1234567890123456',expires:'2026-12-31',warnings:[]});
 assert.equal(parseCouponText('발급일 2026-10-01 유효기간 2027-01-01 거래일 2026-10-02').expires,'2027-01-01');
 assert.equal(parseCouponText('주문일 2026-11-01\n만료일 2026년 12월 5일').expires,'2026-12-05');
});

test('Expiry labels, date formats, next-line values and OCR character spacing',()=>{
 for(const [input,expected] of [
  ['사용기한 2026-12-31','2026-12-31'],
  ['교환기한 : 2026/12/31','2026-12-31'],
  ['만료일자\n2026년 2월 28일','2026-02-28'],
  ['유효기간\n26.12.31까지','2026-12-31'],
  ['Valid until: 2027.01.09','2027-01-09'],
  ['EXPIRY DATE 2027-01-09','2027-01-09'],
  ['Expiration: 2027/01/09','2027-01-09'],
  ['Expires on 2027-01-09','2027-01-09'],
  ['유 효 기 간 : 2 0 2 6 . 1 2 . 3 1','2026-12-31'],
  ['유효기간：２０２６．１２．３１','2026-12-31'],
  ['유효기간: 2028년 2월 29일','2028-02-29']
 ])assert.equal(parseCouponText(input).expires,expected,input);
});

test('A clearly marked date range uses its end, including wrapped ranges',()=>{
 for(const input of [
  '교환기간 2026.11.01 ~ 2026.12.31',
  '유효기간 26.11.01-26.12.31',
  '사용가능기간 2026년 11월 1일부터 2026년 12월 31일까지',
  '교환가능기간\n2026.11.01 ~\n2026.12.31',
  '유효기간 2026.11.01 00:00 ~ 2026.12.31 23:59',
  '유효기간 2026.11.01(일) ~ 2026.12.31(목)',
  'Valid until 2026-11-01 to 2026-12-31'
 ])assert.equal(parseCouponText(input).expires,'2026-12-31',input);
 assert.equal(parseCouponText('유효기간 2027.01.01 ~ 2026.12.31').expires,'');
});

test('Different expiry candidates stay empty; repeated copies agree',()=>{
 const conflict=parseCouponText('사용기한 2026.12.31\n만료일 2027.01.01');
 assert.equal(conflict.expires,'');assert.ok(conflict.warnings.includes('expiry_ambiguous'));
 assert.equal(parseCouponText('유효기간 2026.11.01 2026.12.31').expires,'');
 assert.equal(parseCouponText('유효기간 2026.12.31\n만료일 2026년 12월 31일').expires,'2026-12-31');
 assert.equal(parseCouponText('유효기간 2026.12.31 2026.12.31').expires,'2026-12-31');
});

test('Invalid dates, character guesses, and date fields without expiry context are not inferred',()=>{
 for(const input of [
  '구매일 2026.12.31','발급일 2026.12.31','거래일 2026.12.31','2026.12.31',
  '유효기간 2026.02.29','유효기간 2026.04.31','유효기간 2026.13.01','유효기간 2026.00.15','유효기간 2026.12.00',
  '유효기간 2O26.12.31','유효기간 2026.1Z.31','유효기간 2026.12.3I',
  '유효기간 2026.12','유효기간 12.31','유효기간 20261231',
  '유효기간\n구매일 2026.12.31','유효기간 2026.02.30\n만료일 2026.12.31'
 ])assert.equal(parseCouponText(input).expires,'',input);
});

test('Barcode and coupon numbers retain leading zeroes and normalize only separators',()=>{
 for(const [input,expected] of [
  ['바코드번호 0123-4567-8901-2345','0123456789012345'],
  ['쿠폰번호\n1234 5678 9012','123456789012'],
  ['상품권번호 1234 5678 9012','123456789012'],
  ['BARCODE: 123456789012345678901234','123456789012345678901234'],
  ['Coupon No. 1234567890123','1234567890123'],
  ['Voucher code 1234-5678-9012-3456','1234567890123456'],
  ['PIN 1234 5678 9012','123456789012'],
  ['쿠 폰 번 호 1 2 3 4 5 6 7 8 9 0 1 2','123456789012'],
  ['쿠폰번호：１２３４－５６７８－９０１２','123456789012'],
  ['1234 5678 9012 3456\n유효기간 2026.12.31','1234567890123456']
 ])assert.equal(parseCouponText(input).code,expected,input);
});

test('Codes are conservative about conflicting labels and ambiguous unlabeled numbers',()=>{
 const conflict=parseCouponText('쿠폰번호 123456789012\n바코드 987654321098');
 assert.equal(conflict.code,'');assert.ok(conflict.warnings.includes('code_ambiguous'));
 assert.equal(parseCouponText('123456789012\n987654321098').code,'');
 assert.equal(parseCouponText('바코드 123456789012 987654321098').code,'');
 assert.equal(parseCouponText('1234567890123456 9876543210987654').code,'');
 assert.equal(parseCouponText('쿠폰번호 123456789012 123456789012').code,'123456789012');
 assert.equal(parseCouponText('쿠폰번호 123456789012\n바코드 1234 5678 9012').code,'123456789012');
 assert.equal(parseCouponText('쿠폰번호 ????\n주문번호\n123456789012').code,'');
 assert.equal(parseCouponText('쿠폰번호 123456789012\n주문번호 987654321098').code,'123456789012');
});

test('Phone numbers, corporate identifiers, dates and partial codes cannot become coupon numbers',()=>{
 for(const input of [
  '고객센터 821012345678','전화번호\n821012345678','+82 10 1234 5678','821012345678',
  '쿠폰번호 82 10 1234 5678','사업자등록번호 123-45-67890','법인등록번호 123456-1234567',
  '주문번호 1234567890123456','주문번호\n1234567890123456','상품코드 1234567890123456',
  'Customer service\n123456789012','Order number\n123456789012','거래번호 123456789012',
  '2026-11-01 2026-12-31','2026110120261231','202612312359','20261231235959',
  '쿠폰번호 12345678901','쿠폰번호 1234567890123456789012345','쿠폰번호 ABC123456789012',
  '쿠폰번호 123456789012O','쿠폰번호 123456789012-O','쿠폰번호 123456789012**',
  '쿠폰번호 123456789012 5,000원','상품번호 123456789012 유효기간 2026.12.31'
 ])assert.equal(parseCouponText(input).code,'',input);
});

test('Unknown/malformed input is inert and never shares mutable parsing state',()=>{
 for(const input of [undefined,null,{},[],0,'','   ','<script>alert(1)</script>'])
  assert.deepEqual(parseCouponText(input),{code:'',expires:'',warnings:[]});
 const sample='쿠폰번호 123456789012\n유효기간 2026.12.31';
 for(let index=0;index<5;index++)assert.deepEqual(parseCouponText(sample),{code:'123456789012',expires:'2026-12-31',warnings:[]});
});

test('Browser global exposes the same pure API without a DOM or runtime dependency',()=>{
 const context={};vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../admin/reward-coupon-parser.js'),'utf8'),context);
 assert.equal(typeof context.OjjudaCouponParser.parseCouponText,'function');
 assert.equal(context.OjjudaCouponParser.parseCouponText('유효기간 2026.12.31').expires,'2026-12-31');
});
