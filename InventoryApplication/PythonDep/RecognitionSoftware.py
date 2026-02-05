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
#import os


IMG_SIZE = (224, 224)

def load_image(path):
    img = tf.io.read_file(path)
    img = tf.image.decode_image(img, channels=3)
    img = tf.image.resize(img, IMG_SIZE)
   # img = img / 255.0
    img = tf.cast(img, tf.float32) / 255.0
    return img

root = tk.Tk()
root.withdraw()  # this will hide the empty tkinter window but for testing I leave it

'''
path = filedialog.askopenfilename(
    title="Select an image",
    filetypes=[
        ("Image files", "*.png *.jpg *.jpeg"),
        ("All files", "*.*")
    ]
) '''

'''
This is the difference, names instead of name. 
This allows a range of files to be picked
'''

paths = filedialog.askopenfilenames(
    title = "Select an image",
    filetypes=[
        ("Image files", "*.png *.jpg *.jpeg"),
        ("All files", "*.*")
    ]
)

if not paths:
    raise RuntimeError("No file selected")

for path in paths: #important to use loop as it expects one for every file
    img = load_image(path)
    #img = load_image(r"C:\Users\trent\EclipseProjects\Senior_Project\InventoryApplication\images\imagesConverted\IMG_5971.png")     
    
    plt.imshow(img.numpy())
    plt.title(path.split("/")[-1]) #this is required to split multiple fileNames (crashes otherwise)
    plt.axis("off")
    plt.show()   