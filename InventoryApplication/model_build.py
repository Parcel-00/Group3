#%% 
# CONFIG
import os

IMAGE_BASE_DIR = r"C:\Users\justi\images"

TRAIN_DIR = os.path.join(IMAGE_BASE_DIR, "train")
VAL_DIR   = os.path.join(IMAGE_BASE_DIR, "val")
TEST_DIR  = os.path.join(IMAGE_BASE_DIR, "test")

IMG_SIZE = (224, 224)
BATCH_SIZE = 32

INITIAL_LR = 1e-4
FINE_TUNE_LR = 1e-5

INITIAL_EPOCHS = 10
FINE_TUNE_EPOCHS = 5

BASE_PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_PROJECT_DIR, "models")
MODEL_SAVE_PATH = os.path.join(
    MODEL_DIR,
    "binary_detector_model.keras"   
)

#%% 
# Image Conversion

from PIL import Image

splits = ["train", "val", "test"]
classes = ["marked", "unmarked"]

for split in splits:
    for cls in classes:
        folder = os.path.join(IMAGE_BASE_DIR, split, cls)
        if not os.path.exists(folder):
            continue

        for file in os.listdir(folder):
            if file.lower().endswith(".jpg"):
                continue

            path = os.path.join(folder, file)
            try:
                img = Image.open(path).convert("RGB")
                new_path = os.path.splitext(path)[0] + ".jpg"
                img.save(new_path, "JPEG", quality=95)
                os.remove(path)
            except Exception as e:
                print("Failed:", path, e)

print("Image conversion complete.")

#%% 
# DATA LOADING
import tensorflow as tf

AUTOTUNE = tf.data.AUTOTUNE

def load_dataset(directory, shuffle):
    return tf.keras.utils.image_dataset_from_directory(
        directory,
        image_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        label_mode="binary",
        shuffle=shuffle
    )

def prepare_dataset(ds):
    ds = ds.map(lambda x, y: (x / 255.0, y))
    return ds.prefetch(AUTOTUNE)

train_ds = prepare_dataset(load_dataset(TRAIN_DIR, shuffle=True))
val_ds   = prepare_dataset(load_dataset(VAL_DIR, shuffle=False))

USE_TEST = os.path.exists(TEST_DIR) and len(os.listdir(TEST_DIR)) > 0
if USE_TEST:
    test_ds = prepare_dataset(load_dataset(TEST_DIR, shuffle=False))


#%%
# MODEL BUILDING
def build_model():
    base_model = tf.keras.applications.MobileNetV2(
        input_shape=(224, 224, 3),
        include_top=False,
        weights="imagenet"
    )

    base_model.trainable = False

    model = tf.keras.Sequential([
        base_model,
        tf.keras.layers.GlobalAveragePooling2D(),
        tf.keras.layers.Dense(64, activation="relu"),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(1, activation="sigmoid")
    ])

    return model, base_model

model, base_model = build_model()

#%% 
# INITIAL TRAINING

model.compile(
    optimizer=tf.keras.optimizers.Adam(INITIAL_LR),
    loss="binary_crossentropy",
    metrics=["accuracy"]
)

print("Starting initial training...")
model.fit(
    train_ds,
    validation_data=val_ds,
    epochs=INITIAL_EPOCHS
)

#%% 
# FINE-TUNING

base_model.trainable = True

model.compile(
    optimizer=tf.keras.optimizers.Adam(FINE_TUNE_LR),
    loss="binary_crossentropy",
    metrics=["accuracy"]
)

print("Starting fine-tuning...")
model.fit(
    train_ds,
    validation_data=val_ds,
    epochs=FINE_TUNE_EPOCHS
)

#%% 
# EVALUATION 
if USE_TEST:
    loss, acc = model.evaluate(test_ds)
    print("Test accuracy:", acc)
else:
    print("No test set found — skipping evaluation.")

#%% 
# SAVE MODEL (FIXED)
os.makedirs(MODEL_DIR, exist_ok=True)

print("Saving model to:", MODEL_SAVE_PATH)
assert MODEL_SAVE_PATH.endswith(".keras")  

model.save(MODEL_SAVE_PATH)
print("Model saved successfully.")

#%% 
# SINGLE IMAGE PREDICTION EXAMPLE USE
"""import numpy as np
from tensorflow.keras.preprocessing import image

IMG_PATH = r"c:\Users\justi\images\train\marked\IMG_5978.jpg"  # change if needed

if os.path.exists(IMG_PATH):
    img = image.load_img(IMG_PATH, target_size=IMG_SIZE)
    img = image.img_to_array(img)
    img = np.expand_dims(img, axis=0) / 255.0

    prob = model.predict(img)[0][0]

    if prob < 0.5:
        print(f"MARK DETECTED ({1 - prob:.2%} confidence)")
    else:
        print(f"NO MARK ({prob:.2%} confidence)")"""

