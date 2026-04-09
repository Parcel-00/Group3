# run_node_commands.py
import subprocess
import os
import sys


def run_command():
    # Each command needed to run as a string
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


# --- CONFIGURATION ---

# Change this to the folder where your package.json is located
#project_directory = os.path.dirname(os.path.abspath(__file__))

#trying to run application based off file search, used hardcode sets for now

#file_path = r"C:\Users\trent\EclipseProjects\Senior_Project\Frontend\dashboard-react"

#THIS IS TO FIND A UNIVERSAL FILEPATH and also RUN THE BACKEND
from pathlib import Path

# Start from the current script's location
base_dir = Path(__file__).resolve().parent

# Navigate to Backend
backend_path = base_dir / "Backend"
os.chdir(backend_path)
print(f"Running backend commands in: {os.getcwd()}")
#run backend command
run_command()

# Navigate to Frontend/dashboard-react
dashboard_path = base_dir / "Frontend" / "dashboard-react"

print(dashboard_path)


#project_directory = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard-react")
# --- CHANGE WORKING DIRECTORY ---
#os.chdir(project_directory)
#os.chdir(file_path)

os.chdir(dashboard_path)
print(f"Running commands in: {os.getcwd()}")
run_command()

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

