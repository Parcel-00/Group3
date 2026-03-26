#%% 
# Suppress TensorFlow warnings and ANSI codes
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'  # Suppress all TensorFlow messages
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'  # Disable oneDNN optimizations

# CONFIG
import os

IMAGE_BASE_DIR = r"C:\Users\justi\images1"

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
# Model utilities
import numpy as np
from PIL import Image

# inference plus server dependencies optional
try:
    from flask import Flask, request, jsonify
except ImportError:
    Flask = None


def get_model_path():
    os.makedirs(MODEL_DIR, exist_ok=True)
    return MODEL_SAVE_PATH


def load_saved_model(model_path=None):
    import tensorflow as tf

    if model_path is None:
        model_path = get_model_path()

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Trained model not found at {model_path}")

    return tf.keras.models.load_model(model_path)


def preprocess_image_for_model(image_path):
    img = Image.open(image_path).convert("RGB").resize(IMG_SIZE)
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = np.expand_dims(arr, axis=0)
    return arr


def predict_damage(image_path, model=None, model_path=None):
    import tensorflow as tf
    tf.get_logger().setLevel('ERROR')  # Suppress TensorFlow logs
    
    if model is None:
        model = load_saved_model(model_path)

    x = preprocess_image_for_model(image_path)
    prob = float(model.predict(x, verbose=0)[0][0])  # No progress bar

    result = {
        "damage_probability": 1.0 - prob,
        "no_damage_probability": prob,
        "damage_detected": prob < 0.5,
        "confidence": max(prob, 1.0 - prob),
    }
    return result


def start_model_api(host="0.0.0.0", port=9000, model_path=None):
    if Flask is None:
        raise RuntimeError("Flask is not installed. Install it with pip install flask")

    app = Flask(__name__)
    global _FLASK_MODEL
    _FLASK_MODEL = load_saved_model(model_path)

    @app.route("/infer", methods=["POST"])
    def infer():
        if "image" not in request.files:
            return jsonify({"error": "image file required"}), 400

        image_file = request.files["image"]
        tmp_path = os.path.join(BASE_PROJECT_DIR, "tmp_prediction.jpg")
        image_file.save(tmp_path)

        prediction = predict_damage(tmp_path, model=_FLASK_MODEL)
        return jsonify(prediction)

    app.run(host=host, port=port)


#%%
# helpers for dataset + build
import tensorflow as tf

AUTOTUNE = tf.data.AUTOTUNE
SEED = 123


def build_model():
    base_model = tf.keras.applications.MobileNetV2(
        input_shape=(224, 224, 3),
        include_top=False,
        weights="imagenet",
    )
    base_model.trainable = False

    model = tf.keras.Sequential([
        base_model,
        tf.keras.layers.GlobalAveragePooling2D(),
        tf.keras.layers.Dense(64, activation="relu"),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(1, activation="sigmoid"),
    ])

    return model, base_model


def get_image_files_with_labels(directory):
    classes = sorted(
        entry
        for entry in os.listdir(directory)
        if os.path.isdir(os.path.join(directory, entry))
    )

    paths = []
    labels = []

    for class_index, class_name in enumerate(classes):
        class_dir = os.path.join(directory, class_name)
        for f in os.listdir(class_dir):
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
                paths.append(os.path.join(class_dir, f))
                labels.append(class_index)

    if not paths:
        raise FileNotFoundError("No image files found under directory: {}".format(directory))

    # deterministic shuffle
    idx = np.arange(len(paths))
    rng = np.random.default_rng(SEED)
    rng.shuffle(idx)
    paths = [paths[i] for i in idx]
    labels = [labels[i] for i in idx]

    return paths, labels, classes


def split_data(paths, labels, val_ratio=0.1, test_ratio=0.1):
    n = len(paths)
    n_val = int(n * val_ratio)
    n_test = int(n * test_ratio)
    n_train = n - n_val - n_test

    train_paths = paths[:n_train]
    train_labels = labels[:n_train]

    val_paths = paths[n_train : n_train + n_val]
    val_labels = labels[n_train : n_train + n_val]

    test_paths = paths[n_train + n_val :]
    test_labels = labels[n_train + n_val :]

    return (train_paths, train_labels), (val_paths, val_labels), (test_paths, test_labels)


def load_and_preprocess(path, label):
    image_data = tf.io.read_file(path)
    image = tf.image.decode_image(image_data, channels=3, expand_animations=False)
    image = tf.image.resize(image, IMG_SIZE)
    image = image / 255.0
    return image, label


data_augmentation = tf.keras.Sequential([
    tf.keras.layers.RandomFlip("horizontal"),
    tf.keras.layers.RandomRotation(0.08),
    tf.keras.layers.RandomZoom(0.08),
    tf.keras.layers.RandomTranslation(0.03, 0.03),
])


def create_dataset(paths, labels, training=False):
    ds = tf.data.Dataset.from_tensor_slices((paths, labels))
    if training:
        ds = ds.shuffle(buffer_size=len(paths), seed=SEED)

    ds = ds.map(load_and_preprocess, num_parallel_calls=AUTOTUNE)

    if training:
        ds = ds.map(lambda x, y: (data_augmentation(x, training=True), y), num_parallel_calls=AUTOTUNE)

    ds = ds.batch(BATCH_SIZE).prefetch(AUTOTUNE)
    return ds


def convert_image_files():
    # Convert all non-JPG images to JPG in the main image directory
    classes = ["marked", "unmarked"]

    for cls in classes:
        class_dir = os.path.join(IMAGE_BASE_DIR, cls)
        if not os.path.exists(class_dir):
            continue

        for file in os.listdir(class_dir):
            if file.lower().endswith(".jpg"):
                continue

            path = os.path.join(class_dir, file)
            try:
                img = Image.open(path).convert("RGB")
                new_path = os.path.splitext(path)[0] + ".jpg"
                img.save(new_path, "JPEG", quality=95)
                os.remove(path)
                print(f"Converted {file} to JPG")
            except Exception as e:
                print("Failed to convert:", path, e)

    print("Image conversion complete.")


def train_and_save_model():
    print("Preparing dataset from:", IMAGE_BASE_DIR)
    paths, labels, classes = get_image_files_with_labels(IMAGE_BASE_DIR)

    (train_paths, train_labels), (val_paths, val_labels), (test_paths, test_labels) = split_data(
        paths, labels, val_ratio=0.1, test_ratio=0.1
    )

    train_ds = create_dataset(train_paths, train_labels, training=True)
    val_ds = create_dataset(val_paths, val_labels, training=False)
    test_ds = create_dataset(test_paths, test_labels, training=False)

    model, base_model = build_model()

    model.compile(
        optimizer=tf.keras.optimizers.Adam(INITIAL_LR),
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )
    print("Starting initial training...")
    model.fit(train_ds, validation_data=val_ds, epochs=INITIAL_EPOCHS)

    base_model.trainable = True
    model.compile(
        optimizer=tf.keras.optimizers.Adam(FINE_TUNE_LR),
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )
    print("Starting fine-tuning...")
    model.fit(train_ds, validation_data=val_ds, epochs=FINE_TUNE_EPOCHS)

    if len(test_paths) > 0:
        loss, acc = model.evaluate(test_ds)
        print("Test accuracy:", acc)
    else:
        print("No test split available — skipping evaluation.")

    model_path = get_model_path()
    print("Saving model to:", model_path)
    model.save(model_path)
    print("Model saved successfully.")


if __name__ == "__main__":
    import sys
    
    # Check for prediction mode FIRST (before any training code)
    if len(sys.argv) > 1 and sys.argv[1] == "--predict":
        if len(sys.argv) < 3:
            print("Usage: python model_build.py --predict <image_path>")
            sys.exit(1)
        image_path = sys.argv[2]
        result = predict_damage(image_path)
        import json
        print(json.dumps(result))
        sys.exit(0)
    
    # Training path (same behavior as before but now safe to import)
    convert_image_files()
    train_and_save_model()
    print("Done training and saving model.\nTo run inference server: python model_build.py --serve")

    # optional command-line server mode
    if "--serve" in sys.argv:
        start_model_api()


#Run as a service and can be imported as import model_build without running training code.
#from model_build import predict_damage
