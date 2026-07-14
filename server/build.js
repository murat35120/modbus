const { compile } = require('nexe');
const Zip = require("adm-zip");

console.log("Compiling resources...");

const zip = new Zip();
zip.addLocalFolder("site");
zip.writeZip("resources.zip");
console.log('Success!');

