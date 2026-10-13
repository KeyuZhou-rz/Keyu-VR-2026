export const shader = `uniform int uBRStatic, uBRDoor, uBRMonster, uBREye, uBRGreen, uBRSign, uBRHud;
uniform vec3 uBRPlayer;
float brHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float brWave(vec2 p) { return .018*sin(p.x*3.1+uTime*1.1)+.012*sin(p.y*4.7-uTime*.8); }
vec3 brWater(vec3 p, vec3 eye) {
   float e=.04;
   vec3 n=normalize(vec3(-(brWave(p.xz+vec2(e,0))-brWave(p.xz-vec2(e,0)))/(2.*e),1.,
      -(brWave(p.xz+vec2(0,e))-brWave(p.xz-vec2(0,e)))/(2.*e)));
   vec3 ray=normalize(p-eye), r=reflect(ray,n);
   float t=(5.5-p.y)/max(.01,r.y);
   vec3 ceiling=p+r*t;
   vec2 fixture=abs(mod(ceiling.xz,4.)-vec2(2.));
   vec3 reflected=mix(vec3(.30,.39,.33),vec3(.95,.94,.79),
      (1.-smoothstep(.6,.75,fixture.x))*(1.-smoothstep(.18,.3,fixture.y)));
   for(int i=0;i<2;i++) {
      float plane=33.+8.*float(i), d=(plane-p.z)/r.z;
      vec3 q=p+r*d;
      float arch=pow((q.x-9.)/6.6,2.)+pow((q.y-3.1)/2.35,2.);
      if(d>0. && d<t && q.y>3.1 && arch>1.) reflected=vec3(.37,.52,.46);
   }
   vec3 refracted=refract(ray,n,1./1.333);
   float travel=1.3/max(.12,-refracted.y);
   vec2 floorPoint=p.xz+refracted.xz*travel;
   vec2 edge=min(fract(floorPoint*2.),1.-fract(floorPoint*2.));
   float grout=1.-smoothstep(.02,.04,min(edge.x,edge.y));
   vec3 bottom=mix(vec3(.53,.72,.66),vec3(.19,.33,.29),grout);
   float pattern=sin(floorPoint.x*3.+sin(floorPoint.y*2.+uTime))+sin(floorPoint.y*3.2-uTime*.7);
   bottom+=.07*exp(-abs(pattern)*8.);
   vec3 transmission=exp(-vec3(.35,.075,.055)*travel);
   vec3 water=bottom*transmission+vec3(.035,.27,.25)*(1.-transmission);
   float fresnel=.02+.98*pow(1.-max(0.,dot(-ray,n)),5.);
   return mix(water,reflected,clamp(fresnel,.06,.96));
}
---
if(uBRHud==1) { fragColor=texture(uSampler[8],vUV); return; }
if(uBRSign==1) { fragColor=texture(uSampler[9],vUV); return; }
if(uBRMonster==1) { fragColor=vec4(.025,.033,.03,1); return; }
if(uBREye==1) { fragColor=vec4(.75,.22,.10,1); return; }
if(uBRGreen==1) { fragColor=vec4(.25,.8,.55,1); return; }
if(uBRDoor==1) { fragColor=vec4(vec3(.27,.34,.32)*(.65+.35*abs(vNor.y)),1); return; }
if(uBRStatic==1) {
   vec3 p=vAPos, n=normalize(vNor);
   vec3 brEye=uBRPlayer;
   if(vUV.x>11.5) { fragColor=vec4(brWater(p,brEye),1); return; }
   float m=vUV.x;
   vec2 uv=abs(n.y)>.5 ? p.xz : (abs(n.x)>.5 ? p.zy : p.xy);
   vec3 color=vec3(.65,.60,.31);
   float grain=brHash(floor(uv*60.0));
   if (m<1.5) {
      color=abs(n.y)>.5 ? vec3(.40,.35,.19) : vec3(.74,.67,.35);
      color*=.93+.07*step(.5,fract(uv.x*2.4));
      color*=.94+.08*grain;
   } else if (m<2.5) {
      color=vec3(.34,.29,.23)*(.9+.1*step(.08,fract(uv.y*3.)));
   } else if (m<3.5) {
      vec2 grid=min(fract(uv*2.),1.-fract(uv*2.));
      float grout=1.-smoothstep(.015,.035,min(grid.x,grid.y));
      color=mix(vec3(.65,.80,.75),vec3(.23,.36,.32),grout);
      if(p.y<-.4) color*=vec3(.4,.85,.82);
   } else if (m<4.5) {
      color=vec3(.26,.33,.32)*(.85+.15*step(.04,fract(uv.y*2.)));
   } else if (m<5.5) {
      vec2 grid=min(fract(uv),1.-fract(uv));
      color=mix(vec3(.67,.65,.53),vec3(.28),1.-smoothstep(.015,.03,min(grid.x,grid.y)));
   } else if (m<6.5) {
      float flicker=.975+.025*sin(uTime*9.0+floor(p.x)*3.0+floor(p.z));
      fragColor=vec4(vec3(.95,.94,.79)*flicker,1); return;
   } else if (m<7.5) {
      color=vec3(.025,.033,.03);
   } else if (m<8.5) {
      fragColor=vec4(.75,.22,.10,1); return;
   } else if (m<9.5) {
      if (!gl_FrontFacing) discard;
      fragColor=vec4(1); return;
   } else if (m<10.5) {
      fragColor=vec4(.25,.8,.55,1); return;
   } else {
      fragColor=vec4(1); return;
   }
   vec3 light=vec3(0);
   vec2 base=floor(p.xz/4.0)*4.0+2.;
   float ceiling=p.z>26.0 && p.x<18.0 ? 5.45 : 3.75;
   for(int x=-1;x<=1;x++) for(int z=-1;z<=1;z++) {
      vec3 delta=vec3(base+vec2(x,z)*4.0,ceiling).xzy-p;
      float d2=dot(delta,delta);
      light+=vec3(1.,.95,.79)*max(0.,dot(n,normalize(delta)))/ (1.+.22*d2)*.68;
   }
   float ao=.72+.28*smoothstep(0.,.7,p.y);
   if(n.y>.5) ao=.95;
   color*= (vec3(.19,.20,.17)+light)*ao;
   if(m>6.5 && m<7.5) color+=vec3(.018,.026,.021);
   float fog=1.-exp(-distance(brEye,p)*.012);
   color=mix(color,vec3(.047,.057,.042),fog);
   fragColor=vec4(pow(color,vec3(1./2.2)),1);
   return;

}
`;
