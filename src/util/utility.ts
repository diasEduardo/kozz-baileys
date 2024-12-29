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

export const clearContact = (Contact:string)=>{
    /**
     *  '554899295890:3@s.whatsapp.net' to 
     *  '554899295890@s.whatsapp.net'
     */
    return Contact.replace(/\:[0-9]*\@/,'@');
}

export const getMyContactFromCredentials = () =>{
    const credFile = fs.readFileSync('./creds/creds.json');
    const jsonCred = JSON.parse(credFile.toString());
    return jsonCred.me;
    
}