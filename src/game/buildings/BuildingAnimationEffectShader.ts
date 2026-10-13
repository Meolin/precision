import {
  Filter,
  GlProgram,
  Matrix,
  Sprite,
  Texture,
  UniformGroup,
  type FilterSystem,
  type RenderSurface,
} from 'pixi.js';
import { buildingTransitionVertex } from './BuildingTransitionShader';

const fragment = `precision highp float;
in vec2 vTextureCoord; out vec4 finalColor;
uniform sampler2D uTexture; uniform vec4 uInputSize; uniform vec4 uInputClamp;
uniform float uMode; uniform float uMix; uniform float uVisualOpacity; uniform float uTime;
uniform vec2 uCenter; uniform vec4 uParams; uniform vec4 uAdjust; uniform vec3 uColor; uniform vec4 uBasis; uniform vec4 uMetric;
vec2 toPixels(vec2 point){return vec2(uBasis.x*point.x+uBasis.z*point.y,uBasis.y*point.x+uBasis.w*point.y);}
vec4 readAt(vec2 uv){if(any(lessThan(uv,uInputClamp.xy))||any(greaterThan(uv,uInputClamp.zw)))return vec4(0.);return texture(uTexture,uv);}
void main(){
 vec2 uv=vTextureCoord; vec4 base=readAt(uv); vec4 effect=base;
 float radius=max(0.001,uParams.x),strength=uParams.y;
 vec2 delta=uv*uInputSize.xy-uCenter;vec2 localDelta=vec2(uMetric.x*delta.x+uMetric.z*delta.y,uMetric.y*delta.x+uMetric.w*delta.y);
 if(uMode<0.5){
  vec2 offset=vec2(radius)*0.5;
  effect=base*0.25;
  effect+=(readAt(uv+toPixels(vec2(offset.x,0.))*uInputSize.zw)+readAt(uv-toPixels(vec2(offset.x,0.))*uInputSize.zw)+readAt(uv+toPixels(vec2(0.,offset.y))*uInputSize.zw)+readAt(uv-toPixels(vec2(0.,offset.y))*uInputSize.zw))*0.125;
  effect+=(readAt(uv+toPixels(offset)*uInputSize.zw)+readAt(uv-toPixels(offset)*uInputSize.zw)+readAt(uv+toPixels(vec2(offset.x,-offset.y))*uInputSize.zw)+readAt(uv+toPixels(vec2(-offset.x,offset.y))*uInputSize.zw))*0.0625;
 }else if(uMode<1.5){
  float distance=length(localDelta); float p=distance/radius;
  if(p<1. && distance>0.0001){float factor=strength>=0.?mix(1.,pow(p,1.+strength*0.75),1.-p):mix(1.,pow(p,strength*0.75),1.-p);effect=readAt((uCenter+delta*factor)*uInputSize.zw);}
 }else if(uMode<2.5){
  float distance=length(localDelta);float front=uTime*uParams.w;float width=max(1.,uParams.z);
  if(distance<radius && abs(distance-front)<width && distance>0.001){float phase=(distance-front)/width;float shift=sin(phase*3.14159265)*strength*(1.-abs(phase));effect=readAt(uv+toPixels(localDelta/distance*shift)*uInputSize.zw);}
 }else if(uMode<3.5){
  vec2 pixel=localDelta;float wave=sin(pixel.y/max(1.,uParams.z)*6.2831853+uTime*uParams.w*6.2831853);
  effect=readAt(uv+toPixels(vec2(wave*strength,cos(pixel.x/max(1.,uParams.z)*6.2831853+uTime*2.)*strength*0.25))*uInputSize.zw);
 }else if(uMode<4.5){
  if(base.a>0.0001){vec3 color=base.rgb/base.a;float gray=dot(color,vec3(0.2126,0.7152,0.0722));color=mix(vec3(gray),color,uAdjust.z);color=(color-.5)*uAdjust.y+.5;color*=uAdjust.x;
   float hue=uAdjust.w;vec3 axis=normalize(vec3(1.));color=color*cos(hue)+cross(axis,color)*sin(hue)+axis*dot(axis,color)*(1.-cos(hue));effect=vec4(clamp(color,0.,1.)*base.a,base.a);}
 }else{
  float coverage=0.;float sum=0.;
  for(int ring=1;ring<=4;ring++){for(int i=0;i<12;i++){float angle=float(i)*6.2831853/12.;vec2 offset=toPixels(vec2(cos(angle),sin(angle))*radius*float(ring)/4.)*uInputSize.zw;float alpha=readAt(uv+offset).a;coverage=max(coverage,alpha);sum+=alpha;}}
  float alpha=uMode<5.5?clamp(sum/48.*strength*2.,0.,1.):coverage*strength;
  if(uMode<5.5)alpha*=clamp(uVisualOpacity,0.,1.);
  alpha*=1.-base.a;effect=base+vec4(uColor*alpha,alpha);
 }
 finalColor=mix(base,effect,clamp(uMix,0.,1.));
}`;
function createUniforms(mode: number) {
  return new UniformGroup({
    uMode: { value: mode, type: 'f32' },
    uMix: { value: 1, type: 'f32' },
    uVisualOpacity: { value: 1, type: 'f32' },
    uTime: { value: 0, type: 'f32' },
    uCenter: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
    uParams: { value: new Float32Array([1, 1, 80, 2]), type: 'vec4<f32>' },
    uAdjust: { value: new Float32Array([1, 1, 1, 0]), type: 'vec4<f32>' },
    uColor: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
    uBasis: { value: new Float32Array([1, 0, 0, 1]), type: 'vec4<f32>' },
    uMetric: { value: new Float32Array([1, 0, 0, 1]), type: 'vec4<f32>' },
  });
}
/** Mix interpolates the complete filtered image, including distortion and expanded alpha. */
export class AnimationEffectShader extends Filter {
  readonly origin = new Sprite(Texture.WHITE);
  readonly values: ReturnType<typeof createUniforms>;
  private matrix = new Matrix();
  constructor(mode: number) {
    const values = createUniforms(mode);
    super({
      glProgram: GlProgram.from({
        vertex: buildingTransitionVertex,
        fragment,
        name: 'animation-effects',
      }),
      resources: { effectUniforms: values },
    });
    this.values = values;
  }
  override apply(
    manager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clear: boolean,
  ): void {
    // This proxy is outside the scene tree: Pixi does not update its cached world matrix.
    this.origin.worldTransform.identity().translate(this.origin.x, this.origin.y);
    const center = manager
      .calculateSpriteMatrix(this.matrix, this.origin)
      .applyInverse({ x: 0, y: 0 });
    this.values.uniforms.uCenter.set([
      center.x * input.source.width,
      center.y * input.source.height,
    ]);
    manager.applyFilter(this, input, output, clear);
  }
  override destroy(): void {
    this.origin.destroy();
    super.destroy();
  }
}
