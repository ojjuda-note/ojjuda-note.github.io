/* Coupon OCR text only: uncertain values stay empty for manual confirmation. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.OjjudaCouponParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const gap='[ \\t]*';
 const spaced=word=>[...word].join(gap);
 const korean=words=>words.map(spaced).join('|');
 const labels=[
  {type:'expires',pattern:korean(['유효기간','유효기한','사용기한','사용기간','사용가능기간','사용가능기한','교환기간','교환기한','교환가능기간','만료일자','만료일'])+'|\\bvalid[ \\t]+(?:until|through|thru|to)\\b|\\b(?:expiry|expiration)(?:[ \\t]+date)?\\b|\\bexpires(?:[ \\t]+on)?\\b'},
  {type:'code',pattern:korean(['바코드번호','바코드','쿠폰번호','상품권번호','교환권번호','기프티콘번호','핀번호'])+'|\\bbarcode(?:[ \\t]*(?:number|no\\.?))?\\b|\\b(?:coupon|voucher)[ \\t]*(?:number|no\\.?|code)\\b|\\bpin(?:[ \\t]*(?:number|no\\.?|code))?\\b'},
  {type:'other',pattern:korean(['구매일자','구매일','발급일자','발급일','발행일자','발행일','거래일자','거래일','주문일자','주문일','결제일자','결제일','발송일','제조일','등록일','고객센터','고객상담','고객문의','상담전화','전화번호','문의전화','대표전화','연락처','사업자등록번호','사업자번호','사업자등록','법인등록번호','주민등록번호','주문번호','거래번호','승인번호','결제번호','상품코드','상품번호','계좌번호','카드번호'])+'|\\b(?:issued(?:[ \\t]+(?:date|on))?|(?:issue|purchase|purchased|order|transaction)[ \\t]+(?:date|on))\\b|\\bdate[ \\t]+of[ \\t]+(?:issue|purchase)\\b|\\b(?:tel|telephone|phone|customer[ \\t]+service|order[ \\t]+(?:number|no\\.?)|business[ \\t]+(?:number|no\\.?))\\b'}
 ].map(item=>({...item,regex:new RegExp(item.pattern,'gi')}));

 function normalize(text){
  return (typeof text==='string'?text:'').normalize('NFKC')
   .replace(/\r\n?/g,'\n').replace(/[\u200B-\u200D\uFEFF]/g,'')
   .replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u223C\u301C]/g,'~')
   .replace(/[^\S\n]+/g,' ').trim();
 }
 function findLabels(line){
  const found=[];
  for(const item of labels){
   item.regex.lastIndex=0;
   for(const match of line.matchAll(item.regex))found.push({type:item.type,start:match.index,end:match.index+match[0].length});
  }
  found.sort((a,b)=>a.start-b.start||b.end-a.end);
  return found.filter((item,index)=>!found.slice(0,index).some(previous=>previous.start<=item.start&&previous.end>item.start));
 }
 function readFields(lines,markers,type){
  const fields=[];
  for(let index=0;index<lines.length;index++){
   const lineMarkers=markers[index];
   for(let position=0;position<lineMarkers.length;position++){
    const marker=lineMarkers[position];if(marker.type!==type)continue;
    const next=lineMarkers[position+1];
    let value=lines[index].slice(marker.end,next?.start??lines[index].length);
    // OCR commonly places a field's value on the next line. Never cross another label.
    if(!next)for(let following=index+1;following<Math.min(lines.length,index+4);following++){
     if(markers[following].length)break;
     if(lines[following].trim())value+='\n'+lines[following];
    }
    fields.push(value.slice(0,300));
   }
  }
  return fields;
 }

 function isoDate(year,month,day){
  const y=Number(String(year).replace(/ /g,'')),m=Number(String(month).replace(/ /g,'')),d=Number(String(day).replace(/ /g,''));
  const fullYear=String(year).replace(/ /g,'').length===2?2000+y:y;
  if(fullYear<1900||fullYear>2199||m<1||m>12||d<1||d>31)return '';
  const date=new Date(Date.UTC(fullYear,m-1,d));
  if(date.getUTCFullYear()!==fullYear||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return '';
  return String(fullYear).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
 }
 function findDates(text){
  const year='(?:[12][ \\t]*\\d[ \\t]*\\d[ \\t]*\\d|\\d[ \\t]*\\d)';
  const part='\\d(?:[ \\t]*\\d)?';
  const patterns=[
   new RegExp('('+year+')'+gap+'([./-])'+gap+'('+part+')'+gap+'\\2'+gap+'('+part+')(?!\\d)','g'),
   new RegExp('('+year+')'+gap+'년'+gap+'('+part+')'+gap+'월'+gap+'('+part+')'+gap+'일?','g')
  ];
  const found=[];
  for(let index=0;index<patterns.length;index++)for(const match of text.matchAll(patterns[index])){
   const start=match.index,end=start+match[0].length;
   if(/[A-Za-z0-9]/.test(text[start-1]||'')||/[A-Za-z0-9]/.test(text[end]||''))continue;
   found.push({start,end,iso:index===0?isoDate(match[1],match[3],match[4]):isoDate(match[1],match[2],match[3])});
  }
  return found.sort((a,b)=>a.start-b.start);
 }
 function isRange(gapText){
  const bridge=gapText.trim().replace(/^\([월화수목금토일](?:요일)?\)\s*/,'')
   .replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*/,'');
  return /^(?:~|-|to|through|부터)\s*$/i.test(bridge);
 }
 function expiration(fields,warnings){
  const values=new Set();let invalid=false,ambiguous=false;
  for(const field of fields){
   const dates=findDates(field);
   if(!dates.length)continue;
   if(dates.some(date=>!date.iso)){invalid=true;continue;}
   if(dates.length===1){values.add(dates[0].iso);continue;}
   if(dates.length===2&&isRange(field.slice(dates[0].end,dates[1].start))){
    if(dates[0].iso>dates[1].iso)invalid=true;
    else values.add(dates[1].iso);
   }else if(new Set(dates.map(date=>date.iso)).size===1)values.add(dates[0].iso);
   else ambiguous=true;
  }
  if(invalid)warnings.push('expiry_invalid');
  if(ambiguous||values.size>1)warnings.push('expiry_ambiguous');
  return !invalid&&!ambiguous&&values.size===1?[...values][0]:'';
 }

 function looksLikePhoneOrRegistration(raw,digits){
  // Domestic phone/business numbers are shorter than coupon codes. Keep their
  // formatted forms and international Korean numbers out of concatenated OCR.
  return /(?:^|\D)0\d{1,2}[ -]+\d{3,4}[ -]+\d{4}(?:\D|$)/.test(raw)
   ||/(?:^|\D)1[568]\d{2}[ -]+\d{4}(?:\D|$)/.test(raw)
   ||/(?:^|\D)\d{3}[ -]+\d{2}[ -]+\d{5}(?:\D|$)/.test(raw)
   ||/^\d{6}-\d{7}$/.test(raw.trim())
   ||/^82(?:0)?(?:10|11|16|17|18|19)\d{7,8}$/.test(digits)
   ||/^82(?:0)?(?:2|[3-6]\d)\d{7,8}$/.test(digits);
 }
 function looksLikeDateDigits(digits){
  if(digits.length!==12&&digits.length!==14&&digits.length!==16)return false;
  const first=isoDate(digits.slice(0,4),digits.slice(4,6),digits.slice(6,8));
  if(!first)return false;
  if(digits.length===16)return !!isoDate(digits.slice(8,12),digits.slice(12,14),digits.slice(14,16));
  return Number(digits.slice(8,10))<24&&Number(digits.slice(10,12))<60
   &&(digits.length===12||Number(digits.slice(12,14))<60);
 }
 function codeCandidates(text){
  const values=[];
  for(const line of text.split('\n')){
   const dates=findDates(line);
   for(const match of line.matchAll(/\d(?:[ \t-]*\d)*/g)){
    const start=match.index,end=start+match[0].length,digits=match[0].replace(/\D/g,'');
    if(/[A-Za-z0-9+*?●•]/.test(line[start-1]||'')||/[A-Za-z0-9*?●•]/.test(line[end]||''))continue;
    if(/[A-Za-z*?●•][ -]*$/.test(line.slice(0,start))||/^[ -]*[A-Za-z*?●•]/.test(line.slice(end)))continue;
    if(/[.,]\d/.test(line.slice(end,end+2)))continue;
    if(dates.some(date=>date.start<end&&date.end>start))continue;
    const blocks=match[0].split(/[ \t-]+/);
    if(blocks.length>1&&blocks.every(block=>block.length>=12&&block.length<=24)){
     // Two complete printed numbers are competing candidates, not one long code.
     for(const block of blocks)if(!looksLikePhoneOrRegistration(block,block)&&!looksLikeDateDigits(block))values.push(block);
     continue;
    }
    if(digits.length<12||digits.length>24)continue;
    if(looksLikePhoneOrRegistration(match[0],digits)||looksLikeDateDigits(digits))continue;
    values.push(digits);
   }
  }
  return values;
 }
 function couponCode(lines,markers,fields,warnings){
  const values=new Set();
  if(fields.length){
   for(const field of fields)for(const code of codeCandidates(field))values.add(code);
  }else{
   // A unique number printed alone below a barcode is also useful. Do not infer
   // a code from prose, prices, a different field, or an incomplete numeric run.
   for(let index=0;index<lines.length;index++){
    if(markers[index].length||!/^\s*\d[\d \t-]*\d\s*$/.test(lines[index]))continue;
    let previous=index-1;while(previous>=0&&!lines[previous].trim())previous--;
    const prior=markers[previous]?.at(-1);
    if(prior&&prior.type!=='code'&&!lines[previous].slice(prior.end).replace(/[\s:：]/g,''))continue;
    for(const code of codeCandidates(lines[index]))values.add(code);
   }
  }
  if(values.size>1)warnings.push('code_ambiguous');
  return values.size===1?[...values][0]:'';
 }
 function parseCouponText(text){
  const lines=normalize(text).split('\n'),markers=lines.map(findLabels),warnings=[];
  const expires=expiration(readFields(lines,markers,'expires'),warnings);
  const code=couponCode(lines,markers,readFields(lines,markers,'code'),warnings);
  return {code,expires,warnings};
 }
 return Object.freeze({parseCouponText});
});
