// A chapter is determined by the current position, not by the number of taps.
// An action identifies a real control on this private board. Several equivalent
// controls can be offered together when the player's choice is unrestricted.
export const lesson=(chapters,solo,read,practice={})=>({chapters,solo,read,practice});
export const step=(chapter,action,copy,why,options={})=>({chapter,action,copy,why,...options});
export const enter=value=>({field:value});
export const adjust=(slider,value)=>({slider,value});
