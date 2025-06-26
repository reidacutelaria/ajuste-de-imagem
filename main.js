const { app, core, action } = require("photoshop");
const { batchPlay } = action;

// --- ELEMENTOS DA UI ---
const laminaSelect = document.getElementById("lamina-select");
const caboSelect = document.getElementById("cabo-select");
const btnAplicarAjustes = document.getElementById("btnAplicarAjustes");
const btnAtualizar = document.getElementById("btnAtualizar");

// --- FUNÇÕES PRINCIPAIS ---

/**
 * Popula os seletores com as camadas do documento,
 * priorizando o artboard/grupo ativo.
 */
async function popularDropdowns() {
    try {
        laminaSelect.innerHTML = "";
        caboSelect.innerHTML = "";

        const doc = app.activeDocument;
        if (!doc) {
            const msg = "<sp-menu-item>Abra um documento</sp-menu-item>";
            laminaSelect.innerHTML = msg;
            caboSelect.innerHTML = msg;
            return;
        }

        let layers = doc.layers;
        const selectedLayers = doc.activeLayers;
        if (selectedLayers.length === 1 && (selectedLayers[0].kind === "group" || selectedLayers[0].isArtboard)) {
            layers = selectedLayers[0].layers;
        }

        if (!layers || layers.length === 0) {
            const msg = "<sp-menu-item>Nenhuma camada encontrada</sp-menu-item>";
            laminaSelect.innerHTML = msg;
            caboSelect.innerHTML = msg;
            return;
        }

        const laminaLayerToSelect = layers.find(l => l.name && (l.name.toLowerCase().includes("lâmina") || l.name.toLowerCase().includes("lamina")));
        const caboLayerToSelect = layers.find(l => l.name && l.name.toLowerCase().includes("cabo"));
        
        let camadaValidaEncontrada = false;
        layers.forEach(layer => {
            if (layer.kind === "adjustment" || layer.kind === "group" || !layer.bounds) {
                return;
            }

            const createOption = (isSelected) => {
                const option = document.createElement('sp-menu-item');
                option.textContent = layer.name;
                option.value = layer.id;
                if (isSelected) {
                    option.selected = true;
                }
                return option;
            };

            const isLamina = laminaLayerToSelect && layer.id === laminaLayerToSelect.id;
            const isCabo = caboLayerToSelect && layer.id === caboLayerToSelect.id;

            laminaSelect.appendChild(createOption(isLamina));
            caboSelect.appendChild(createOption(isCabo));
            
            camadaValidaEncontrada = true;
        });

        if (!camadaValidaEncontrada) {
            const msg = "<sp-menu-item>Nenhuma camada válida</sp-menu-item>";
            laminaSelect.innerHTML = msg;
            caboSelect.innerHTML = msg;
        }
    } catch (e) {
        console.error("Erro ao popular seletores:", e);
        const msg = `<sp-menu-item>Erro ao carregar</sp-menu-item>`;
        laminaSelect.innerHTML = msg;
        caboSelect.innerHTML = msg;
        core.showAlert("Ocorreu um erro ao carregar as camadas: " + e.message);
    }
}

/**
 * Função principal que executa todos os ajustes.
 */
async function aplicarTodosAjustes() {
    const laminaLayerId = parseInt(laminaSelect.value);
    const caboLayerId = parseInt(caboSelect.value);

    if (!laminaLayerId || !caboLayerId) {
        return core.showAlert("Por favor, selecione as camadas para a Lâmina e o Cabo.");
    }
    if (laminaLayerId === caboLayerId) {
        return core.showAlert("A camada da Lâmina e do Cabo não podem ser a mesma.");
    }

    try {
        await core.executeAsModal(async (executionContext) => {
            const hostControl = executionContext.hostControl;
            const doc = app.activeDocument;
            
            const laminaLayer = doc.layers.find(l => l.id === laminaLayerId);
            const caboLayer = doc.layers.find(l => l.id === caboLayerId);

            if (!laminaLayer || !caboLayer) {
                throw new Error("Uma ou mais camadas selecionadas não foram encontradas.");
            }
            
            const suspensionID = await hostControl.suspendHistory({
                "documentID": doc.id,
                "name": "Ajustes Rei da Cutelaria"
            });

            try {
                await ajustarLamina(laminaLayer);
                await ajustarCabo(caboLayer);
                await agruparESombrear([laminaLayer, caboLayer]);
            } finally {
                await hostControl.resumeHistory(suspensionID);
            }
        }, { "commandName": "Aplicando Ajustes de Faca" });
    } catch (e) {
        console.error("Erro ao aplicar ajustes:", e);
        await core.showAlert("Ocorreu um erro inesperado: " + e.message);
    }
}


// --- FUNÇÕES DE AJUSTE ---

async function ajustarLamina(layer) {
    // 1. Desaturação
    await criarCamadaDeAjuste("hueSaturation", { saturation: -100 }, layer);
    // 2. Curvas
    const pointsLamina = [[137, 153], [71, 64]];
    await criarCamadaDeAjuste("curves", { curve: pointsLamina }, layer);
    // 3. Brilho e Contraste
    await criarCamadaDeAjuste("brightnessContrast", { brightness: 8, contrast: 2 }, layer);
    // 4. Filtros na camada
    await layer.applyFilter("dustAndScratches", { radius: 1, threshold: 10 });
    await layer.applyUnsharpMask(100, 1.0, 5);
}

async function ajustarCabo(layer) {
    // 1. Curvas
    const pointsCabo = [[75, 58], [135, 123]];
    await criarCamadaDeAjuste("curves", { curve: pointsCabo }, layer);
    // 2. Matiz/Saturação (Azuis)
    await criarCamadaDeAjuste("hueSaturation", { edit: "blues", saturation: -100 }, layer);
}

async function criarCamadaDeAjuste(type, values, targetLayer) {
    const doc = app.activeDocument;
    let newLayer;

    switch(type) {
        case "hueSaturation":
            newLayer = await doc.createHueSaturationLayer(values.saturation, 0, 0);
            if (values.edit === 'blues') {
                // Comando específico para alterar o canal azul
                await batchPlay(
                   [{ _obj: 'set', _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }], to: { _obj: 'hueSaturation', adjustment: [{ _obj: 'hueSatAdj', edit: 'blues', saturation: -100 }] } }],
                   { synchronousExecution: true }
                );
            }
            break;
        case "curves":
            newLayer = await doc.createCurvesLayer();
            newLayer.curves.points = values.curve;
            break;
        case "brightnessContrast":
            newLayer = await doc.createBrightnessContrastLayer(values.brightness, values.contrast);
            break;
        default:
            return;
    }
    
    if (newLayer) {
        await newLayer.move(targetLayer, "placeAbove");
        newLayer.clipped = true;
    }
}

async function agruparESombrear(layers) {
    const layerIDs = layers.map((l) => l.id);
    const selectCommand = layerIDs.map(id => ({ _ref: "layer", _id: id }));
    
    await batchPlay([{ _obj: "select", _target: selectCommand, makeVisible: false }], {});
    
    const groupResult = await batchPlay([{ _obj: "make", new: { _obj: "layerSection" } }], {});
    const groupId = groupResult[0].layerID;

    await batchPlay(
    [{
        _obj: "set",
        _target: [{ _ref: "property", _property: "layerEffects" }, { _ref: "layer", _id: groupId }],
        to: {
            _obj: "layerEffects",
            scale: { _unit: "percentUnit", _value: 100 },
            dropShadow: {
                _obj: "dropShadow",
                enabled: true,
                mode: { _enum: "blendMode", _value: "multiply" },
                color: { _obj: "RGBColor", red: 0, green: 0, blue: 0 },
                opacity: { _unit: "percentUnit", _value: 35 },
                useGlobalAngle: true,
                localLightingAngle: { _unit: "angleUnit", _value: 120 },
                distance: { _unit: "pixelsUnit", _value: 10 },
                spread: { _unit: "percentUnit", _value: 5 },
                size: { _unit: "pixelsUnit", _value: 10 },
            }
        },
    }], {});
}

// --- INICIALIZAÇÃO ---

function setup() {
    btnAplicarAjustes.addEventListener("click", aplicarTodosAjustes);
    btnAtualizar.addEventListener("click", popularDropdowns);
    
    require("uxp").entrypoints.setup({
        panels: {
            vanilla: {
                show() {
                    popularDropdowns();
                }
            }
        }
    });
}

setup(); 