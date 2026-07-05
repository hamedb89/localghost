import { Plugin } from 'vite';
import { C as ConfigPattern } from './config-Cde1Bich.js';

type LocalGhostPluginOptions = {
    cwd?: string;
    fileName?: string;
    configFiles?: string[];
    configPattern?: ConfigPattern;
    port?: number;
    https?: boolean;
    bindHost?: string | boolean;
    dynamicPort?: boolean;
    primaryHost?: string;
    log?: boolean;
    setup?: boolean | "prompt";
    localghostConfig?: string | false;
    wwwAlias?: boolean;
};
declare function localGhostPlugin(options?: LocalGhostPluginOptions): Plugin;
declare const localHostsPlugin: typeof localGhostPlugin;
type LocalHostsPluginOptions = LocalGhostPluginOptions;

export { type LocalGhostPluginOptions, type LocalHostsPluginOptions, localGhostPlugin, localHostsPlugin };
