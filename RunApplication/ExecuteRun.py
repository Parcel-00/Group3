# run_node_commands.py
import subprocess
import os
import sys

# --- CONFIGURATION ---
# Change this to the folder where your package.json is located
#project_directory = os.path.dirname(os.path.abspath(__file__))

#trying to run application based off file search, used hardcode sets for now

file_path = r"C:\Users\trent\EclipseProjects\Senior_Project\InventoryApplication\Frontend\dashboard-react"
#project_directory = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard-react")
# --- CHANGE WORKING DIRECTORY ---
#os.chdir(project_directory)
os.chdir(file_path)
print(f"Running commands in: {os.getcwd()}")

'''
#Try and run the commands needed to pull up the frontEnd
try:
    #shell=True is needed to process as string
    #result = subprocess.run("npm install",shell=True, capture_output=True, text=True, check=True)
    #print(result.stdout)
    #result = subprocess.run("npm run dev",shell=True, capture_output=True, text=True, check=True)
    #print(result.stdout)

    result = subprocess.run(["npm", "install"], capture_output=True, text=True, check=True)
    print(result.stdout)

    result = subprocess.run(["npm", "run", "dev"], capture_output=True, text=True, check=True)
    print(result.stdout)


except subprocess.CalledProcessError as e:
    print(f"Error")
    #print(f"Command '{' '.join(cmd)}' failed with error:\n{e.stderr}")
    sys.exit(1)  # Stop if a command fails

'''
commands = [
    "npm install",
    "npm run dev"
]

for cmd in commands:
    print(f"\nRunning command: {cmd}")
    try:
        result = subprocess.run(cmd, shell=True, text=True, check=True)
        print(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Command '{cmd}' failed with error:\n{e}")
        sys.exit(1)
'''
# --- COMMANDS TO RUN ---
#this will need to be changed
commands = [
    ["npm", "install"],
    ["npm", "run", "dev"]
]

# --- EXECUTE EACH COMMAND ---
for cmd in commands:
    print(f"\nRunning command: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(result.stdout)
        if result.stderr:
            print("Errors (if any):\n", result.stderr)
    except subprocess.CalledProcessError as e:
        print(f"Command '{' '.join(cmd)}' failed with error:\n{e.stderr}")
        sys.exit(1)  # Stop if a command fails
    '''