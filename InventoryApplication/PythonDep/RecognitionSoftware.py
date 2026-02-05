'''
Created on Jan 29, 2026

@author: trent
'''
from keras.src.utils.image_utils import load_img
from tkinter.constants import OFF

"""
class Containter(object):
    '''
    classdocs
    '''


    def __init__(self, params):
        '''
        Constructor
        '''
        """
import tensorflow as tf
import matplotlib.pyplot as plt
import tkinter as tk
from tkinter import filedialog
import numpy as np
import json
import math
import os


IMG_SIZE = (224, 224)
#this is to make sure we are reading real image files
IMAGE_EXTS = (".png", ".jpg", ".jpeg")

#Method to load the images to fit the table (may not be necessary with keras)
def load_image(path):
    img = tf.io.read_file(path)
    #img = tf.image.decode_image(img, channels=3)
    img = tf.image.decode_png(img, channels=3) #needed line to decode specifically to png
    #img = tf.image.decode_jpeg(img, channels=3) #in case we need jpeg too
    img = tf.image.resize(img, IMG_SIZE)
   # img = img / 255.0
    img = tf.cast(img, tf.float32) / 255.0
    return img

root = tk.Tk()
root.withdraw()  # this will hide the empty tkinter window but for testing I leave it

'''
This is the difference, names instead of name. 
This allows a range of files to be picked
'''
''' # This is if we wish to go the direction of individual files instead of fodlers
paths = filedialog.askopenfilenames(
    title = "Select an image",
    filetypes=[
        ("Image files", "*.png *.jpg *.jpeg"),
        ("All files", "*.*")
    ]
)
# paths = paths[:16] #if we wanted to limit the number of files selected
# paths = sorted(paths) if we wanted to sort each file

if not paths:
    raise RuntimeError("No file selected")
'''
#This is if we wish to go through the single folder selection option
folder = filedialog.askdirectory(title="Select image folder") #ask for directory

if not folder:
    raise RuntimeError("No folder selected")

# ---- Collect image files ----
paths = [
    os.path.join(folder, f)
    for f in os.listdir(folder)
    if f.lower().endswith(IMAGE_EXTS) #added to make sure we are reading image files
]

if not paths:
    raise RuntimeError("No image files found in folder")

paths.sort() #sorting line to get recent file (for later)

#a line to print verification that the folder was loaded well
print(f"Loaded {len(paths)} images from:\n{folder}")

#may need to add checker for bad files (that would be the following)

'''
for path in paths:
    try:
        img = load_image(path)
    except Exception as e:
        print(f"Skipping {path}: {e}")
        continue
'''

#the following is to send data to a dataset
#method to load the json file (this is a bit much from GPT, will need to break down
def loadImagesJSON(image_paths): #this should be framed from the paths variable
    
    # ---- Create dataset ---- (yes from chatGPT)
    path_ds = tf.data.Dataset.from_tensor_slices(paths) #sets the dataframe
    image_ds = path_ds.map(load_image, num_parallel_calls=tf.data.AUTOTUNE) #reads the data frame
    
    print(f"Dataset contains {len(paths)} images")
    '''
    At this point the dataset is created but unused (the path_ds and image_ds)
    next we need to use it (may be added into a method?)
    '''

    metadata = [] #create metadata array
    ContainerCount =0 #initialize a countainer name for the metadata
    
    for path, img in zip(image_paths, image_ds):
        ContainerCount+=1 #update counter
        img_np = img.numpy()
        
        #the JSON format
        entry = {
            #"filename": os.path.basename(path),
            "filename": f"Container:{ContainerCount}", #Names each container
            "path": path,
            "shape": img_np.shape,
            "mean_pixel": float(np.mean(img_np)),
            "std_pixel": float(np.std(img_np))
        }
        #append metadata array for each image
        metadata.append(entry)
    
    
    # ---- Save to JSON ---- (saves the entry into the file)
    output_path = os.path.join(folder, "image_metadata.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Saved metadata to {output_path}")

#method to show the images in a grid format
def gridShowcase():
    #this is a grid layout
    num_images = len(paths)
    cols = math.ceil(math.sqrt(num_images))
    rows = math.ceil(num_images / cols)
    
    plt.figure(figsize=(cols * 3, rows * 3)) #adds a figure display for the window
    
    #for path in paths: #important to use loop as it expects one for every file
    for i, path in enumerate(paths):
        img = load_image(path)
        #img = load_image(r"C:\Users\trent\EclipseProjects\Senior_Project\InventoryApplication\images\imagesConverted\IMG_5971.png")     
        
        plt.subplot(rows, cols, i + 1)
    
        plt.imshow(img.numpy())
        plt.title(os.path.basename(path), fontsize=8) #add titles to each image
    
        #plt.title(path.split("/")[-1]) #this is required to split multiple fileNames (crashes otherwise)
        plt.axis("off")
        
    plt.tight_layout()
    plt.show()   
    
    
#CALL METHODS
loadImagesJSON(paths)

gridShowcase()