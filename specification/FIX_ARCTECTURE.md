
// **********Layer 2: Framework/tool level ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// On this level we create base contact for allour tool and consumers ant sprate project repo pacjed form consumer eand core it imporant to understed
// -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Framework config file
// -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
import { createCoreConfig } from 'moku_core';

type GlobalConfig = {
    property: string[]; // Globa confguration of framework, we set here all properties that we will need to make global accesible for all plagiins that wil be created with this core config
    mode: 'SPA' | 'SSG'
};

type GloabState = { // Here will beglobal state that shared actoss all
    stateProp: string[];
};

type GloabEvents = {
    "app:event": (data: string[]) => number;
};

// config.ts Frame work configirarion file, it seprate from main index.ts it will allow plugins use this gloval configration with CD
const coreConfig = createCoreConfig<GlobalConfig, GloabState, GloabEvents>("moku", { // Framework ID
    config: { // Global config defaults, can be ovriddedn in appCreate, typed to GlobalConfig
        site: { title: "Test", url: "https://test.com" },
        build: { outDir: "./out", minify: false }
    },
    createIntialState: ctx => ({ // What will be initial gloabal state
        stateProp: [] // state will start from empty array, typed to GloabState 
    })
});

// Frame work will use this fucntion that 
export { createPlugin, createComponent, createModule, createCore } = coreConfig;


// -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Framework plugins folders
// plugins (folder)
//    heroPlugin(folder) -> index.ts + folder with utirl busness logic etc
//    sidePlugin(folder) -> index.ts + folder with utirl busness logic etc
//   ....
// -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// Expmpe of heroPlugin plugin logic -----------------------------------------------------------------------------------------------------------------
import { createPlugin } from './config';

// Plugins evens contract
type PluginEvents = {
    "plugin:event": (data: string[]) => number;
};

// Important there is no generic for state, confgi etc in createPlugin only optional PluginEvents contract!!!! It very Important all other contract already set ian ifered by createCoreConfig
// Only optional PluginEvents can be provided on this level
export const heroPlugin = createPlugin<PluginEvents>('hero', { // It already know all global config typepin signals and have access (read and write) to global state
    defaultConfig: {
        property: ["prop"]
    },
    createState: () => ({ // Create plagin soce opnly plagin can write read
       localStateProp: ["test"]
    }),
    api: ctx => ({
        heroCall: data => {
            ctx.global.state.stateProp // access to tryped gloval state
            ctx.emit('plugin:event'); // Typed becose PluginEvents was provided
            return ctx.state.localStateProp.length + data.length;
        }
    }),
    hooks: { // Listen gloabl events typed to GloabEvents  
      'app:event': data => {   } // Typed gloabal events !!! 
    }
});

// Expmpe 2 of sidePlugin plugin logic with dependency of heroPlugin (it sprate. forlder)  -----------------------------------------------------------------------------------------------------------------
import { createPlugin } from './config';
import { heroPlugin } from './plugins/heroPlugin'; // Important dependency plugin

// Important there is no generic for createPlugin, iotianl event cofnig was skipped!!!! It very Important all contract already set in cofnig
export const sidePlugin = createPlugin('side', { 
    depends: [heroPlugin], // NOW side have gloabl api state events typeing + all heroPlugin api and events typings!!!
    defaultConfig: {
        property: ["prop"]
    },
    createState: () => ({ // Create plagin soce opnly plagin can write read
       localStateProp: ["test"]
    }),
    api: ctx => ({
        sideCall: data => {
            ctx.global.state.stateProp // access to tryped gloval state
            ctx.require('hero').heroCall([]); // Typed becose of heroPlugin depdndency
            return ctx.state.localStateProp.length + data.length;
        }
    }),
    hooks: { // Listen gloabl events typed to GloabEvents  
       'plugin:event': data => {} // Typed beacouse of heroPlugin depdndency was set
    }
});

// -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Framework main index.ts file  (export to consumers)
// -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
import { createCore } from './config';

// Export createPlugin/Component/Module 
const { createApp, createComponent, createModule } = createCore(coreConfig,{
    plugins: [heroPlugin, sidePlugin, testPlugin], // What plugins will be by default in core
    pluginConfigs: {
        hero: { title: "Welcome" },
        test2: {
            property: ["overridden"]
        }
    }
});

 // Export to consumer api it will create Gloabl cotract + plugin contract and APIs so you get full api on consumer. 
 // Also cosumer will get createPlugin, createComponent, createModule will full api contrat that can be used to create consumer plugins with power of all frameworsk api
export { createApp, createPlugin, createComponent, createModule };

// **********Layer 3: consumer level ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// It's our consumer level usage of framework and sepraet project etc
// -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
import { createApp, createPlugin } from 'moku'; // Import framework form package

// Consumer can have own plugins that baased on framework confguration, it will be saprate files and folder i will palce it ere jsut ot explain
export const consumerPlugin = createPlugin('consumer', { 
    defaultConfig: {
        property: ["prop"]
    },
    createState: () => ({ // Create plagin soce opnly plagin can write read
       localStateProp: ["test"]
    }),
    api: ctx => ({
        consumerCall: data => {
            ctx.global.state.stateProp // access to tryped gloval state
            ctx.require('hero').heroCall([]); // Typed becose it ussed createPlugin framerowl level function that already have full plugin confguration
            return ctx.state.localStateProp.length + data.length;
        }
    }),
    hooks: { // Listen gloabl events typed to GloabEvents  
       'plugin:event': data => {} /// Typed becose it ussed createPlugin framerowl level function that already have full plugin confguration
    }
});

// main.ts Main consumer file -------------------------------------------
import { createApp, createPlugin } from './plugins/consumer'; // Import framework form package
import { optionalPlugin, optionalModule, optionalComponent } from 'moku/plugins'; // Framworks provided optional plugins and modules thet was not in defaut consig anc consumer can enable then if wasnt

const app = await createApp({
    // Extra features setup for app
    plugins:  [consumerPlugin, optionalPlugin] // Add consumer plugins to app 
    components: [optionalComponent] // Components similar to plugins  by flatten
    modules: [optionalModule] // Modules similar to plagins but with own cocle 

    // Gloabl cobfugration, if default doesnt work or if cofnig requred no defaults
    property: ['some data'],
    mode: 'SPA'

    // Plugins configs
    hero: {
        /// Hero plugin config
    },
    side: {
        // side plugin config 
    }
});

// All soudl have full type access to.app publi plugins apis and config and customer plugins
app.hero.callHero() // shoudl work and typed
app.side.callSide() // houdl work and typed
app.consumer.consumerCall() // shoudl work and typed

// All plugins components modules if the provide api shoudl be accesable over app and be part of app cycle!!!!
