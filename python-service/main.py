import uvicorn

import shutil

from pathlib import Path

from fastapi import FastAPI, File, UploadFile

from fastapi.responses import FileResponse # Import FileResponse

from pptx import Presentation



# --- Setup ---

app = FastAPI(

    title="AI Presentation Maker - Post-Processing Engine",

    description="This service handles Stage 2 PPTX generation (Z-order correction).",

    version="0.2.1" # Version bump for new feature

)



# Define and create the temporary directory

TEMP_DIR = Path("temp")

TEMP_DIR.mkdir(exist_ok=True)



print(f"Python service running. Temp directory is at: {TEMP_DIR.resolve()}")



# --- Endpoints ---



@app.get("/")

def read_root():

    return {"status": "Stage 2 Post-Processing Engine is running."}





@app.post("/api/process-pptx")

async def process_pptx(pptx_file: UploadFile = File(...)):

    """

    Receives the Stage 1 PPTX file, performs Z-order correction,

    and saves the processed file.

    """

    

    received_file_path = TEMP_DIR / "stage1_received.pptx"

    processed_file_path = TEMP_DIR / "stage2_processed.pptx"

    

    try:

        # 1. Save the uploaded file from Stage 1

        with received_file_path.open("wb") as buffer:

            shutil.copyfileobj(pptx_file.file, buffer)

        

        print(f"Successfully received file: {received_file_path}")



        # === 2. Z-ORDER CORRECTION LOGIC ===

        print("Starting Z-order correction...")

        prs = Presentation(received_file_path)

        slide = prs.slides[0]

        

        shape_to_move = None

        for shape in slide.shapes:

            if shape.name == 'action: send-to-back':

                shape_to_move = shape

                print(f"Found shape to move: {shape_to_move.name}")

                break

        

        if shape_to_move:

            shape_element = shape_to_move.element

            spTree = slide.shapes._spTree

            spTree.remove(shape_element)

            spTree.insert(0, shape_element)

            print("Successfully moved shape to back (index 0) of _spTree.")

        else:

            print("No shape tagged with 'action: send-to-back' was found.")

            

        # 3. Save the newly processed file

        prs.save(processed_file_path)

        print(f"Successfully saved processed file: {processed_file_path}")



        return {

            "status": "success",

            "message": "PPTX file received, Z-order corrected, and saved.",

            "stage1_file": str(received_file_path.name), # Return only filename

            "stage2_file": str(processed_file_path.name) # Return only filename

        }

    

    except Exception as e:

        print(f"Error processing file: {e}")

        return {

            "status": "error", 

            "message": f"Failed to process file: {str(e)}"

        }

    finally:

        pptx_file.file.close()



# === NEW ENDPOINT FOR FILE DOWNLOADING ===

@app.get("/api/get-processed-file/{filename}")

async def get_processed_file(filename: str):

    """

    Serves the processed PPTX file from the temp directory.

    """

    file_path = TEMP_DIR / filename

    print(f"Request received for file: {file_path}")

    

    if not file_path.exists():

        print("File not found.")

        return {"error": "File not found"}, 404

    

    # Use FileResponse to stream the file back

    return FileResponse(

        path=file_path,

        media_type='application/vnd.openxmlformats-officedocument.presentationml.presentation',

        filename=filename

    )





if __name__ == "__main__":

    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)
