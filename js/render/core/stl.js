export async function stl (partName) {
   try {

      // FETCH THE FILE AND WAIT FOR IT TO LOAD.

      const response = await fetch('media/stl/' + partName + '.stl');
      if (! response.ok)
         throw new Error(`HTTP error: ${response.status}`);

      const textData = await response.text();

      // CONVERT FROM ASCII FORMAT TO AN ARRAY OF VERTICES

      let facetData = textData.split('facet ');

      let vertexData = [];
      for (let n = 1 ; n < facetData.length ; n++) {

         let D = facetData[n].split(' ');
	 D = [D[15],D[16],D[17], D[1],D[2],D[3],
	      D[24],D[25],D[26], D[1],D[2],D[3],
	      D[33],D[34],D[35], D[1],D[2],D[3]];

         let V = [];
         for (let i = 0 ; i < D.length ; i++)
	    V[i] = parseFloat(D[i]);
         vertexData.push(V.slice( 0, 6));
         vertexData.push(V.slice( 6,12));
         vertexData.push(V.slice(12,18));
      }

      // CREATE A NEW TRIANGLES MESH TYPE WITH THIS PART NAME.

      clay.defineMesh(partName, clay.trianglesMesh(vertexData));

   } catch (error) {
      console.log('Failed to read stl file:', error);
   }
}
