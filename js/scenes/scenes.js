export default () => {
   return {
      enableSceneReloading: true,
      scenes: [ 
            { name: "simple"     , path: "./simple.js"     , public: true },
            { name: "shapes"     , path: "./shapes.js"     , public: true },
            { name: "jointed"    , path: "./jointed.js"    , public: true },
            { name: "interact"   , path: "./interact.js"   , public: true },
            { name: "beam"       , path: "./beam.js"       , public: true },
            { name: "lines"      , path: "./lines.js"      , public: true },
            { name: "linefont"   , path: "./linefont.js"   , public: true },
            { name: "linefont2"  , path: "./linefont2.js"  , public: true },
            { name: "buddha"     , path: "./buddha.js"     , public: true },
            { name: "beamSphere" , path: "./beamSphere.js" , public: true },
            { name: "construct"  , path: "./construct.js"  , public: true },
            { name: "aiquery"    , path: "./aiquery.js"    , public: true },
            { name: "SO101"      , path: "./SO101.js"      , public: true },
            { name: "SO101_parts", path: "./SO101_parts.js", public: true },
      ]
   };
}
