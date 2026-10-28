import { G2 } from "../util/g2.js";
import { matchCurves } from "../render/core/matchCurves.js";

// VARIOUS EXAMPLES OF g2 WIDGETS

export const init = async model => {

   let g2Wiggle = new G2();
   model.txtrSrc(3, g2Wiggle.getCanvas());
   let objWiggle = model.add('square').txtr(3).move(-.2,1.7,0).scale(.15);

   let g2Chart = new G2();
   model.txtrSrc(5, g2Chart.getCanvas());
   let objChart = model.add('square').txtr(5).move(-.2,1.3,0).scale(.15);

   let g2Clock = new G2();
   model.txtrSrc(6, g2Clock.getCanvas());
   let objClock = model.add('square').txtr(6).move(.2,1.3,0).scale(.15);

   let g2Widgets = new G2();
   model.txtrSrc(7, g2Widgets.getCanvas());
   let objWidgets = model.add('square').txtr(7).move(.2,1.7,0).scale(.15);

   model.animate(() => {
      g2Wiggle.update();
      g2Chart.update();
      g2Clock.update();
      g2Widgets.update();
   });

   // ANIMATED WIGGLY LINE

   g2Wiggle.render = function() {
      this.setColor([.5,.5,1,.5]);
      this.fillRect(-1,-1,2,2);

      this.setColor('yellow');
      this.textHeight(.05);
      this.text('This is an animated texture\non a transparent 2D canvas.', 0, .85, 'center');

      this.setColor('red');
      this.lineWidth(.02);
      let path = [];
      for (let i = 0 ; i < 100 ; i++)
         path.push([.2 * Math.sin(.08 * i - 2 * model.time), .4 - .01 * i]);
      this.drawPath(path);
   }

   // ANIMATED BAR CHART

   g2Chart.render = function() {
      this.setColor('white');
      this.textHeight(.07);
      this.text('This 2D texture uses\na library function to\nrender a bar chart.', 0, .7, 'center');

      this.setColor('blue');
      let values = [];
      for (let n = 0 ; n < 4 ; n++)
         values.push(.5 + .4 * Math.sin(n + 3 * model.time));
      this.barChart(-.25,-.25,.5,.5, values, ['frodo','merry','pippin','samwise'],
                                             ['red'  ,'green','blue'  ,'magenta']);
   }

   // ANIMATED CLOCK

   g2Clock.render = function() {
      this.clock();
   }

   // VARIOUS INTERACTIVE WIDGETS

   g2Widgets.render = function() {
      this.setColor('white').fillRect(-1,-1,2,2);
      this.setColor('black').textHeight(.09);
      this.text('VARIOUS WIDGETS', 0, .85, 'center');
      this.text('' + (100*g2Widgets.value[0]>>0),  0,  -.20, 'center');
      this.text('' + (100*g2Widgets.value[1]>>0), -.37, .15, 'center');
      this.textHeight(.07);
      this.text('button:', -.3, -.5, 'right');
      this.text('slider:', -.3, -.8, 'right');
   }
   g2Widgets.value = [.5,.5];
   g2Widgets.addWidget(objWidgets, 'trackpad',  0,  .15, '#ff8080', 'trackpad', value => g2Widgets.value = value);
   g2Widgets.addWidget(objWidgets, 'button'  , .3, -.5 , '#ffffff', ['hello','goodbye'], value => {});
   g2Widgets.addWidget(objWidgets, 'slider'  , .3, -.8 , '#ffffff', 'my slider', value => {});
}
