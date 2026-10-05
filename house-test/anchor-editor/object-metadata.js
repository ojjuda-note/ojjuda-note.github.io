// The object and its intended use are shared by all three direction pictures.
export const OBJECT_USAGES={furniture:['floor','surface'],cushion:['shared','sofa','bed'],blanket:['sofa','bed','floor']};
export const USAGE_LABELS={shared:'소파·침대 공용',sofa:'소파용',bed:'침대용',floor:'바닥용',surface:'책상·가구 위'};
export function objectMetadata(value={}){
 const objectType=value.objectType??'furniture',usage=value.usage??OBJECT_USAGES[objectType]?.[0],dimensionStatus=value.dimensionStatus??'unspecified';
 if(!OBJECT_USAGES[objectType]?.includes(usage)||!['unspecified','suggested'].includes(dimensionStatus))throw new Error('개체 종류와 용도를 확인해 주세요.');
 return {objectType,usage,dimensionStatus};
}
