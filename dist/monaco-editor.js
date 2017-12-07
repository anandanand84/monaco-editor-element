(function (window) {
    window._getCharWidth = function (char, font) {
        var cacheKey = char + font;
        if (window._getCharWidth._cache[cacheKey]) {
            return window._getCharWidth._cache[cacheKey];
        }
        var context = window._getCharWidth._canvas.getContext("2d");
        context.font = font;
        var metrics = context.measureText(char);
        var width = metrics.width;
        window._getCharWidth._cache[cacheKey] = width;
        return width;
    }

    window._getCharWidth._cache = {};
    window._getCharWidth._canvas = document.createElement('canvas');
})(window);

// Dynamically polyfill the `caretRangeFromPoint` method
if (typeof ShadowRoot.prototype.caretRangeFromPoint === 'undefined') {
    /**
     * The `best I can do` polyfill for this method
     */
    ShadowRoot.prototype.caretRangeFromPoint = function (x, y) {
        // Get the element under the point
        var el = this.elementFromPoint(x, y);

        // Get the last child of the element until its firstChild is a text node
        // This assumes that the pointer is on the right of the line, out of the tokens
        // and that we want to get the offset of the last token of the line
        while (el.firstChild.nodeType !== el.firstChild.TEXT_NODE) {
            el = el.lastChild;
        }

        // Grab its rect
        var rect = el.getBoundingClientRect();
        // And its font
        var font = window.getComputedStyle(el, null).getPropertyValue('font');

        // And also its txt content
        var text = el.innerText;

        // Poisition the pixel cursor at the left of the element
        var pixelCursor = rect.left;
        var offset = 0;
        var step;

        // If the point is on the right of the box put the cursor after the last character
        if (x > rect.left + rect.width) {
            offset = text.length;
        } else {
            // Goes through all the characters of the innerText, and checks if the x of the point
            // belongs to the character.
            for (var i = 0; i < text.length + 1; i++) {
                // The step is half the width of the character
                step = window._getCharWidth(text.charAt(i), font) / 2;
                // Move to the center of the character
                pixelCursor += step;
                // If the x of the point is smaller that the position of the cursor, the point is over that character
                if (x < pixelCursor) {
                    offset = i;
                    foundPos = true;
                    break;
                }
                // Move between the current character and the next
                pixelCursor += step;
            }
        }

        // Creates a range with the text node of the element and set the offset found
        var range = document.createRange();
        range.setStart(el.firstChild, offset);
        range.setEnd(el.firstChild, offset);

        return range;
    };
}

class MonacoEditor extends HTMLElement {

    static get observedAttributes() {
        return ['value', 'language', 'theme', 'read-only', 'no-line-numbers',
                'namespace', 'no-rounded-selection', 'no-scroll-beyond-last-line'];
    }

    constructor () {
        super();
        this.createdCallback();
    }

    createdCallback () {
        this._value = '';
        this._namespace = './dist/monaco-editor/vs';

        this.addStringProperty('theme', 'theme', 'vs');
        this.addStringProperty('language', 'language', 'javascript');

        this.addBooleanProperty('readOnly', 'readOnly', false);
        this.addBooleanProperty('noLineNumbers', 'lineNumbers', false, false, true);
        this.addBooleanProperty('noRoundedSelection', 'roundedSelection', false, false, true);
        this.addBooleanProperty('noScrollBeyondLastLine', 'scrollBeyondLastLine', false, false, true);
    }

    attachedCallback () {
        this.connectedCallback.apply(this, arguments);
    }

    detachedCallback () {
        this.disconnectedCallback.apply(this, arguments);
    }

    connectedCallback () {
        this._loading = true;
        // Create a shadow root to host the style and the editor's container'
        this.root = typeof this.attachShadow === 'function' ? this.attachShadow({ mode: 'open' }) : this.createShadowRoot();
        this.styleEl = document.createElement('style');
        this.container = document.createElement('div');
        // Expand the container to the element's size
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        // Append the style and container to the shadow root
        this.root.appendChild(this.styleEl);
        this.root.appendChild(this.container);
        // Get the dependencies if needed
        var self = this;
        this._loadDependency().then(function (){
            // Fill the style element with the stylesheet content
            self.styleEl.innerHTML = MonacoEditor._styleText;
            // Create the editor
            let fetchPromise = fetch('https://raw.githubusercontent.com/anandanand84/technicalindicators/master/declarations/generated.d.ts', { method: 'get'})
            
            fetchPromise.then(function(response) {
                return response.text();
            })
            .then(function(content) {
                var technicalIndicators = content.replace(new RegExp('default ', 'g'), '').split('export').join('declare');
                var disposableIndicators = monaco.languages.typescript.typescriptDefaults.addExtraLib(
                technicalIndicators
                , 'indicators.d.ts');
                var disposableShapeFns = monaco.languages.typescript.typescriptDefaults.addExtraLib(
                `
                    declare function inputBoolean(name: string, defaultValue?: boolean): boolean;
                    declare function inputString(name: string, defaultValue?: string): string;
                    declare function inputLineWidth(name: string, defaultValue?: number): LineWidth;
                    declare function inputNumber(name: string, defaultValue?: number, options?: InputNumberOptions): number;
                    declare function inputColor(name: string, defaultValue?: string): string;
                    declare function inputPlotType(name: string, defaultValue?: AvailablePlotType): AvailablePlotType;
                    declare function inputOpacity(name: string, defaultValue?: number): number;
                    declare function inputList(name: string, defaultValue: string, choices?: string[]): string;
                    declare function inputSource(name: string, defaultValue: string): number[];
                    declare function plot(name: string, series: number[], styles?: PlotStyle, options?: DrawingOptions): any;
                    declare function fill(name: string, series1: number[], series2: number[], style?: FillStyle, options?: DrawingOptions): any;
                    declare function hline(name: string, location: number, styles?: PlotStyle, options?: DrawingOptions): any;
                    declare function hfill(name: string, number1: number, number2: number, style?: FillStyle, options?: DrawingOptions): any;
                `
                , 'shape.d.ts');
                monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                    target: monaco.languages.typescript.ScriptTarget.ES5,
                    noEmit : true,
                    noLib : true,
                    lib : ['ES5'],
                    allowNonTsExtensions: true
                });
                self.editor = monaco.editor.create(self.container, self.editorOptions);
                self.editor.viewModel._shadowRoot = self.root;
                self.bindEvents();
                self._loading = false;
                // Notify that the editor is ready
                self.dispatchEvent(new CustomEvent('ready', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        
                    }
                }));
            })
        });
    }

    bindEvents () {
        this.editor.onDidChangeModelContent(event => {
            this.value = this.editor.getValue();
            this.dispatchEvent(new CustomEvent('changed', { composed: true, bubbles: true }));
        });
    }

    /**
    * Loads the monaco dependencies and the required stylesheet. Prevent data to be loaded twice
    */
    _loadDependency () {
        if (!MonacoEditor._loadingPromise) {
            MonacoEditor._loadingPromise = Promise.all([
                this._loadMonaco(),
                this._loadStylesheet()
            ]);
        }
        return MonacoEditor._loadingPromise;
    }

    /**
     * Use the require method from the vscode-loader to import all the dependencies
     */
    _loadMonaco () {
        return new Promise((resolve, reject) => {
            require.config({ paths: { 'vs': this.editorOptions.namespace }});
            require(['vs/editor/editor.main'], resolve);
        });
    }

    /**
     * We need to embed this stylesheet in a style tag inside the shadow root
     */
    _loadStylesheet () {
        return fetch(`${this.editorOptions.namespace}/editor/editor.main.css`)
            .then(r => r.text())
            .then(style => {
                MonacoEditor._styleText = style;
                return style;
            });
    }

    disconnectedCallback () {
        this.root.removeChild(this.container);
        this.editor.dispose();
    }

    attributeChangedCallback (name, oldValue, newValue) {
        let camelCased = name.replace(/-([a-z])/g, (m, w) => {
            return w.toUpperCase();
        });
        this[camelCased] = newValue;
    }

    addStringProperty (name, monacoName, value, reflectToAttribute) {
        let cachedName = '_' + name,
            attrName = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(),
            monacoOptions = {};
        this[cachedName] = value;
        Object.defineProperty(this, name, {
            get: () => {
                return this[cachedName];
            },
            set: (value) => {
                if (this[cachedName] === value) {
                    return;
                }
                this[cachedName] = value;
                if (reflectToAttribute) {
                    this.setAttribute(attrName, this[cachedName])
                }
                if (this.editor) {
                    monacoOptions[monacoName] = this[cachedName];
                    this.editor.updateOptions(monacoOptions);
                }
            }
        });
    }

    addBooleanProperty (name, monacoName, value, reflectToAttribute, invert) {
        let cachedName = '_' + name,
            attrName = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(),
            monacoOptions = {};
        value = Boolean(value);
        this[cachedName] = value;
        Object.defineProperty(this, name, {
            get: () => {
                return this[cachedName];
            },
            set: (value) => {
                value = value == '' ? true : Boolean(value);
                if (this[cachedName] === value) {
                    return;
                }
                this[cachedName] = value;
                if (reflectToAttribute) {
                    if (value) {
                        this.setAttribute(attrName, '');
                    } else {
                        this.removeAttribute(attrName);
                    }
                }
                if (this.editor) {
                    monacoOptions[monacoName] = invert ? !this[cachedName] : this[cachedName];
                    this.editor.updateOptions(monacoOptions);
                }
            }
        });
    }

    set value (value) {
        if (this._value === value) {
            return;
        }
        this._value = value;
        if (this.editor) {
            this.editor.setValue(this._value);
        }
    }

    get value () {
        return this._value;
    }

    get editorOptions () {
        return {
            namespace: this.namespace,
            theme: this.theme,
            readOnly: this.readOnly,
            lineNumbers: !this.noLineNumbers,
            roundedSelection: !this.noRoundedSelection,
            scrollBeyondLastLine: !this.noScrollBeyondLastLine,
            value:`
//Editor executes on every trade
//Sample indicator
let { high, low, close } = this.data;
let period = inputNumber('Period', 14);
let strokeColor = inputColor('Color', '#64B5F6')
let atrValues = atr({ high, low, close, period})
plot('ATR', atrValues, { strokeColor });

// Managing state between runs, 
// To store state that persist between different runs of the indicator you should use state like below.
//This state is shared by all charts and all indicators, create namespaces like line two for your specific instruments or charts or indicators
let state = this.state;
state[this.metadata.instrument] = {} //Store for this instrument
    

//Sample Trading from editor using placeOrder, cancelOrder, 
console.log(this.metadata);
let status = await placeOrder(this.metadata.exchange, {
    "exchange":this.metadata.exchange,
    "symbol": this.metadata.instrument,
    "transactionType": "SELL",
    "quantity":2,
    "orderType":"LIMIT",
    "validity":"GTC",
    "postOnly":true,
    "hiddenOrder":false,
    "price":600.84
})
if(status) {
    console.log('Order placed');
} else {
    console.log('Order Failed');
}
await updateOrder(this.metadata.exchange); //Update the order line in chart;

//For more advanced editor operation glance available indicators in edit mode.
`,
            fontSize : 12,
            emptySelectionClipboard:false,
            formatOnType : false,
            formatOnPaste : true,
            parameterHints : true,
            language: 'typescript'
        }
    }

    set namespace (ns) {
        if (this._namespace === ns) {
            return;
        }
        this._namespace = ns;
    }

    get namespace () {
        return this._namespace;
    }

    getEditor () {
        return this.editor;
    }

    get loading () {
        return this._loading;
    }
}

if ('customElements' in window) {
    customElements.define('monaco-editor', MonacoEditor);
} else if ('registerElement' in document) {
    document.registerElement('monaco-editor', MonacoEditor);
} else {
    console.error('Defining a custom element is not supported in this browser');
}

