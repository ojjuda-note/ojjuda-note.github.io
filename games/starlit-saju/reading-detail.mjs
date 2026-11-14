// The authored section headings organise the complete reading. They do not
// generate another interpretation or replace any of its original paragraphs.
export function readingDetailSections(item) {
  if(item?.detailSections==null)return null;
  const sections=item.detailSections,paragraphs=item.paragraphs;
  const text=value=>typeof value==='string'&&value.trim().length>0;
  if(!Array.isArray(sections)||!sections.length||!Array.isArray(paragraphs)
    ||sections.some(section=>!text(section?.title)||!Array.isArray(section.paragraphs)
      ||!section.paragraphs.length||!section.paragraphs.every(text))) {
    throw new Error('항목의 자세한 풀이를 준비하지 못했어요. 다시 불러와 주세요.');
  }
  const complete=sections.flatMap(section=>section.paragraphs);
  if(complete.length!==paragraphs.length||complete.some((value,index)=>value!==paragraphs[index])) {
    throw new Error('항목의 설명이 빠짐없이 연결되지 않았어요. 다시 불러와 주세요.');
  }
  return sections;
}

export function readingDetailText(item) {
  const sections=readingDetailSections(item);
  return sections?sections.flatMap(section=>[section.title,...section.paragraphs]):[...(item?.paragraphs||[])];
}

/** Keep the whole selected story visible, with semantic headings between parts. */
export function appendReadingDetail(parent,item,appendParagraphs,{headingTag='h6'}={}) {
  parent.classList.add('reading-body-content');
  const sections=readingDetailSections(item);
  if(!sections){appendParagraphs(parent,item?.paragraphs||[]);return;}
  for(const [index,section] of sections.entries()) {
    const heading=parent.ownerDocument.createElement(headingTag);
    heading.className='reading-body-heading';heading.textContent=section.title;
    heading.dataset.readingDetailSection=String(index);parent.append(heading);
    const before=parent.children.length;
    appendParagraphs(parent,section.paragraphs);
    for(const paragraph of [...parent.children].slice(before))paragraph.dataset.readingDetailSection=String(index);
  }
}
