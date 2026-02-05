'''
Created on Jan 29, 2026

@author: trent
'''

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
import os


IMG_SIZE = (224, 224)

def load_image(path):
    img = tf.io.read_file(path)
    img = tf.image.decode_image(img, channels=3)
    img = tf.image.resize(img, IMG_SIZE)
   ## img = img / 255.0
    img = tf.cast(img, tf.float32) / 255.0
    return img

img = load_image(r"C:\Users\trent\EclipseProjects\Senior_Project\InventoryApplication\images\imagesConverted\IMG_5971.png")     

plt.imshow(img.numpy())
plt.show()   