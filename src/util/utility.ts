import fs from 'fs'

export const createFolderOnInit = () =>{

    tryCreateFolder(`./medias`);
}

const tryCreateFolder = (path:string) =>{
    try{
        fs.mkdirSync(path);
    }catch{

    }
}