export default () => {
   return {
      enableSceneReloading: true,
      scenes: [ 
            { name: "simple"   , path: "./simple.js"   , public: true },
            { name: "shapes"   , path: "./shapes.js"   , public: true },
            { name: "jointed"  , path: "./jointed.js"  , public: true },
            { name: "walker"   , path: "./walker.js"   , public: true },
            { name: "interact" , path: "./interact.js" , public: true },
            { name: "beam"     , path: "./beam.js"     , public: true },
            {name: "saber", path: "./saber.js", public: true},
            {name: "linefont", path: "./linefont.js", public: true},
            {name: "linefont2", path: "./linefont2.js", public: true},
            {name: "buddha", path: "./buddha.js", public: true},
            {name: "shooting", path: "./shooting.js", public: true},
            {name: "font_test", path: "./font_test.js", public: true},
            {name: "penger_test", path:"./index.js", public:true}
      ]
   };
}
