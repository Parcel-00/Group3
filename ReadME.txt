This is the runnable (basic) Demo for the Front end thorugh Vite.

This does require NODE js to be installed in order to be run.
There is an executable file called RunExecutable.py that you can simply run to 
start the vite server, (you may also need to start the backend server) you can use h+enter to see the commands or o+enter right away
to see the website.
The email and password as of right now is: 
admin@gmail.com
PS: admin

As of right now the Executable file needs the specific file path to "dashboard-react"
in the "Frontend" folder on your local machine specicified in the "file_path=" variable.

Otherwise:
First you must navigate a terminal to the folder Backend and run:
npm install
npm run dev
this starts the backend server for processing

Then, you would need to open another terminal, navigate to "Frontend\dashboard-react" file,
and run these commands inside that folder:
"npm install" (installs npm for react/vite)
"npm run dev"

To open on your phone: 
Start the application on your desired server (computer machine) 
and merelly enter on your phones web browser:
http://'Your ip address that is the host':5173 (the default port for vite)

NOTE: you put in your computers ip address or network host.

IMPORTANT:
Some public networks (such as Eastern Michigans) does not allow such easy access
from the computer to the phone.
I then used cloudflare where once the site is running to open in the phone you 
must run 'cloudflared tunnel --url http://localhost:5173' and then use the random url from your
phone. In this case HTTPS=False in vite.config

