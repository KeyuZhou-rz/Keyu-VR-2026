export const init = async model => {
   let tableTop = model.add();
   let table = tableTop.add('cube').move(0,-.01,0).scale(.5,.01,.5).color(.4,.2,.1).opacity(.7);

   let head = tableTop.add();
   let LHand = tableTop.add();
   let RHand = tableTop.add();

   head.add('sphere').scale(.08,.1,-.08).color(1,.5,.5);
   head.child(0).add('sphere').color(0,0,0).turnY(-.4).turnX(-.2).move(0,0,1).scale(.24,.14,.05);
   head.child(0).add('sphere').color(0,0,0).turnY( .4).turnX(-.2).move(0,0,1).scale(.24,.14,.05);

   LHand.add('tubeZ').scale(.02,.02,-.05).color(1,1,1);
   LHand.add('sphere').move(0,0,-.1).scale(.03).color(.5,.5,.5);

   RHand.add('tubeZ').scale(.02,.02,-.05).color(1,1,1);
   RHand.add('sphere').move(0,0,-.1).scale(.03).color(.5,.5,.5);

   model.animate(() => {
      tableTop.identity().move(0,.75,-.1).scale(.3,.3,-.3);
      head.setMatrix(clientState.head(0));
      LHand.setMatrix(clientState.hand(0,'left' ));
      RHand.setMatrix(clientState.hand(0,'right'));
   });
}
