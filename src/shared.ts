export interface FntPadding {
  up: number;
  right: number;
  down: number;
  left: number;
}

export interface FntSpacing {
  horizontal: number;
  vertical: number;
}

export interface FntInfo {
  face: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  unicode: boolean;
  smooth: boolean;
  fixedHeight: boolean;
  charSet: number;
  stretchH: number;
  aa: number;
  padding: FntPadding;
  spacing: FntSpacing;
  outline: number;
}

export interface FntCommon {
  lineHeight: number;
  base: number;
  scaleW: number;
  scaleH: number;
  pages: number;
  packed: boolean;
  alphaChnl: number;
  redChnl: number;
  greenChnl: number;
  blueChnl: number;
}

export interface FntChar {
  id: number;
  char: string;
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
  page: number;
  chnl: number;
}

export interface FntKerning {
  first: number;
  firstChar: string;
  second: number;
  secondChar: string;
  amount: number;
}

export interface FntFont {
  info: FntInfo;
  common: FntCommon;
  pages: string[];
  chars: FntChar[];
  kernings: FntKerning[];
}
