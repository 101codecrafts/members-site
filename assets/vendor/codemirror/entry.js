import {basicSetup} from "codemirror";
import {EditorView, keymap} from "@codemirror/view";
import {EditorState, Compartment} from "@codemirror/state";
import {indentWithTab} from "@codemirror/commands";
import {cpp} from "@codemirror/lang-cpp";
import {java} from "@codemirror/lang-java";
import {python} from "@codemirror/lang-python";
import {javascript} from "@codemirror/lang-javascript";
window.CM6 = {basicSetup, EditorView, keymap, EditorState, Compartment, indentWithTab, lang:{cpp, c:cpp, java, python, javascript}};
