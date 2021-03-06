'use strict';

var inherits = require('inherits');

var assign = require('lodash/object/assign');

var Ids = require('ids');

var Viewer = require('./Viewer');

var TableModeler = require('./table/Modeler');

var initialTemplate = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<definitions xmlns="http://www.omg.org/spec/DMN/20151101/dmn.xsd"',
  'id="definitions"',
  'name="definitions"',
  'namespace="http://camunda.org/schema/1.0/dmn">',
  '<decision id="decision" name="">',
  '<decisionTable id="decisionTable">',
  '<input id="input1" label="">',
  '<inputExpression id="inputExpression1" typeRef="string">',
  '<text></text>',
  '</inputExpression>',
  '</input>',
  '<output id="output1" label="" name="" typeRef="string">',
  '</output>',
  '</decisionTable>',
  '</decision>',
  '</definitions>'
].join('\n');

/**
 * A modeler for DMN tables.
 *
 *
 * ## Extending the Modeler
 *
 * In order to extend the viewer pass extension modules to bootstrap via the
 * `additionalModules` option. An extension module is an object that exposes
 * named services.
 *
 * The following example depicts the integration of a simple
 * logging component that integrates with interaction events:
 *
 *
 * ```javascript
 *
 * // logging component
 * function InteractionLogger(eventBus) {
 *   eventBus.on('element.hover', function(event) {
 *     console.log()
 *   })
 * }
 *
 * InteractionLogger.$inject = [ 'eventBus' ]; // minification save
 *
 * // extension module
 * var extensionModule = {
 *   __init__: [ 'interactionLogger' ],
 *   interactionLogger: [ 'type', InteractionLogger ]
 * };
 *
 * // extend the viewer
 * var dmnModeler = new Modeler({ additionalModules: [ extensionModule ] });
 * dmnModeler.importXML(...);
 * ```
 *
 *
 * ## Customizing / Replacing Components
 *
 * You can replace individual table components by redefining them in override modules.
 * This works for all components, including those defined in the core.
 *
 * Pass in override modules via the `options.additionalModules` flag like this:
 *
 * ```javascript
 * function CustomContextPadProvider(contextPad) {
 *
 *   contextPad.registerProvider(this);
 *
 *   this.getContextPadEntries = function(element) {
 *     // no entries, effectively disable the context pad
 *     return {};
 *   };
 * }
 *
 * CustomContextPadProvider.$inject = [ 'contextPad' ];
 *
 * var overrideModule = {
 *   contextPadProvider: [ 'type', CustomContextPadProvider ]
 * };
 *
 * var dmnModeler = new Modeler({ additionalModules: [ overrideModule ]});
 * ```
 *
 * @param {Object} [options] configuration options to pass to the viewer
 * @param {DOMElement} [options.container] the container to render the viewer in, defaults to body.
 * @param {String|Number} [options.width] the width of the viewer
 * @param {String|Number} [options.height] the height of the viewer
 * @param {Object} [options.moddleExtensions] extension packages to provide
 * @param {Array<didi.Module>} [options.modules] a list of modules to override the default modules
 * @param {Array<didi.Module>} [options.additionalModules] a list of modules to use with the default modules
 */
function Modeler(options) {

  options = assign({ editingAllowed: true }, options);

  options.editor = TableModeler;

  Viewer.call(this, options);

  // hook ID collection into the modeler
  this.on('import.parse.complete', function(event) {
    if (!event.error) {
      this._collectIds(event.definitions, event.context);
    }
  }, this);

  this.on('table.destroy', function() {
    this.moddle.ids.clear();
  }, this);

  this.on('view.switch', function(context) {
    var decision = context.decision;

    if (context.fromTable && !decision.extensionElements) {
      this.createDecisionDi(decision);
    }
  }, this);
}

inherits(Modeler, Viewer);

module.exports = Modeler;


Modeler.prototype.createTemplate = function(done) {
  this.importXML(initialTemplate, done);
};


/**
 * Create a moddle instance, attaching ids to it.
 *
 * @param {Object} options
 */
Modeler.prototype._createModdle = function(options) {
  var moddle = Viewer.prototype._createModdle.call(this, options);

  // attach ids to moddle to be able to track
  // and validated ids in the DMN 1.1 XML document
  // tree
  moddle.ids = new Ids([ 32, 36, 1 ]);

  return moddle;
};

/**
 * Collect ids processed during parsing of the
 * definitions object.
 *
 * @param {ModdleElement} definitions
 * @param {Context} context
 */
Modeler.prototype._collectIds = function(definitions, context) {

  var moddle = definitions.$model,
      ids = moddle.ids,
      id;

  // remove references from previous import
  ids.clear();

  for (id in context.elementsById) {
    ids.claim(id, context.elementsById[id]);
  }
};

Modeler.prototype.createDecisionDi = function(decision) {
  var elementFactory = this.get('elementFactory'),
      canvas = this.get('canvas'),
      eventBus = this.get('eventBus'),
      drdFactory = this.get('drdFactory');

  var decisionShape = elementFactory.createShape({ type: 'dmn:Decision', businessObject: decision }),
      bounds;

  decisionShape = assign(decisionShape, { x: 200, y: 200 });

  bounds = drdFactory.createDiBounds({
    x: 200,
    y: 200,
    width: decisionShape.width,
    height: decisionShape.height
  });

  decision.extensionElements.$parent = decision;

  bounds.$parent = decision.extensionElements;

  decision.extensionElements.values.push(bounds);

  canvas.addShape(decisionShape);

  eventBus.fire('drdElement.added', { element: decisionShape, di: decision.extensionElements });
};

// modules the modeler is composed of
//
// - viewer modules
// - interaction modules
// - modeling modules

Modeler.prototype._interactionModules = [
  // non-modeling components
  require('diagram-js/lib/navigation/movecanvas'),
  require('diagram-js/lib/navigation/touch'),
  require('diagram-js/lib/navigation/zoomscroll')
];

Modeler.prototype._modelingModules = [
  // modeling components
  require('diagram-js/lib/features/move'),
  require('diagram-js/lib/features/bendpoints'),
  require('diagram-js/lib/features/overlays'),
  require('./features/editor-actions'),
  require('./features/context-pad'),
  require('./features/keyboard'),
  require('./features/label-editing'),
  require('./features/modeling'),
  require('./features/palette'),
  require('./features/definition-properties/modeler')
];

Modeler.prototype._modules = [].concat(
  Modeler.prototype._modules,
  Modeler.prototype._interactionModules,
  Modeler.prototype._modelingModules);
