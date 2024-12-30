import fs from 'fs'
import { ContactPayload } from 'kozz-types';

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
    let jsonCred = JSON.parse(credFile.toString());
    jsonCred.me.id = clearContact(jsonCred.me.id!);
    return jsonCred.me;
}

export const replaceTaggedName = (text:string,tagged:ContactPayload[])=>{
	text = text.replace(/\@([0-9]*)/g,`$1@s.whatsapp.net`);
    tagged.forEach((contact) =>{
        text = text.replace(contact.id,contact.publicName);
    });
    return text;
}