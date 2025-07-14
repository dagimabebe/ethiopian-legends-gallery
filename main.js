let scene, camera, renderer;
let world;
let playerBody;
const playerMass = 70;
const playerRadius = 0.5;
const playerEyeHeight = 1.6;
let controlsEnabled = false;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let isOnGround = false;
const playerMoveSpeed = 5.0;
const playerJumpVelocity = 5.0;
const clock = new THREE.Clock();
const cannonStep = 1 / 60;
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _PI_2 = Math.PI / 2;
const minPitchAngle = -_PI_2 + 0.01;
const maxPitchAngle = _PI_2 - 0.01;
let currentlyViewedArtwork = null;
let infoOverlay = null;
let lastInfoUpdateTime = 0;
const INFO_UPDATE_INTERVAL = 500;
let raycaster = null;
let mouse = new THREE.Vector2();
let artworkMeshes = [];

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    raycaster = new THREE.Raycaster();
    infoOverlay = document.getElementById('infoOverlay');
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    const hallSize = 20;
    let wallHeight = 3;
    wallHeight *= 2;
    const halfHallSize = hallSize / 2;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.05);
    directionalLight.position.set(10, 15, 10);
    scene.add(directionalLight);

    const spotLightY = wallHeight - 0.5;
    const spotLightProperties = {
        color: 0xffeedd,
        intensity: 1.5,
        distance: hallSize * 0.8,
        angle: Math.PI / 6,
        penumbra: 0.6,
        decay: 2
    };

    const createSpotlight = (x, y, z, targetX, targetY, targetZ) => {
        const light = new THREE.SpotLight(
            spotLightProperties.color,
            spotLightProperties.intensity,
            spotLightProperties.distance,
            spotLightProperties.angle,
            spotLightProperties.penumbra,
            spotLightProperties.decay
        );
        light.position.set(x, y, z);
        light.target.position.set(targetX, targetY, targetZ);
        scene.add(light.target);
        light.castShadow = true;
        light.shadow.mapSize.width = 1024;
        light.shadow.mapSize.height = 1024;
        light.shadow.camera.near = 0.5;
        light.shadow.camera.far = spotLightProperties.distance;
        scene.add(light);
        return light;
    };

    const wallTargetY = wallHeight / 2.5;
    const spotLightOffsetFromWall = 2;
    const zPositions = [-hallSize / 3.5, 0, hallSize / 3.5];

    zPositions.forEach(zPos => {
        createSpotlight(
            hallSize / 2 - spotLightOffsetFromWall, spotLightY, zPos,
            hallSize / 2, wallTargetY, zPos
        );
    });

    zPositions.forEach(zPos => {
        createSpotlight(
            -hallSize / 2 + spotLightOffsetFromWall, spotLightY, zPos,
            -hallSize / 2, wallTargetY, zPos
        );
    });

    const xPositions = [-hallSize / 3.5, 0, hallSize / 3.5];
    xPositions.forEach(xPos => {
        createSpotlight(
            xPos, spotLightY, hallSize / 2 - spotLightOffsetFromWall,
            xPos, wallTargetY, hallSize / 2
        );
    });

    xPositions.forEach(xPos => {
        createSpotlight(
            xPos, spotLightY, -hallSize / 2 + spotLightOffsetFromWall,
            xPos, wallTargetY, -hallSize / 2
        );
    });

    const centralLight = new THREE.PointLight(0xfff5e1, 0.25, hallSize * 1.2, 2);
    centralLight.position.set(0, wallHeight - 0.3, 0);
    centralLight.castShadow = false;
    scene.add(centralLight);

    world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;

    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0 });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(groundBody);

    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const textureLoader = new THREE.TextureLoader();
    const woodFloorTexture = textureLoader.load('https://cdn.polyhaven.com/asset_img/primary/wood_planks.png?height=720', function(texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set((hallSize / 4) * 10, (hallSize / 4) * 10);
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.needsUpdate = true;
    });

    const groundMaterial = new THREE.MeshStandardMaterial({
        map: woodFloorTexture,
        side: THREE.DoubleSide,
        roughness: 0.8,
        metalness: 0.1
    });

    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const benchMaterial = new THREE.MeshStandardMaterial({ color: 0x5A5A5A, roughness: 0.7, metalness: 0.2 });
    const benchScaleFactor = 3.0;
    let originalSeatHeight = 0.4;
    originalSeatHeight /= 2;
    const originalSeatWidth = 2.0;
    const originalSeatDepth = 0.5;
    const seatHeight = originalSeatHeight * benchScaleFactor;
    const seatWidth = originalSeatWidth * benchScaleFactor;
    const seatDepth = originalSeatDepth * benchScaleFactor;

    const benchGroup = new THREE.Group();
    benchGroup.position.set(0, 0, 0);
    scene.add(benchGroup);

    const seatGeo = new THREE.BoxGeometry(seatWidth, seatHeight, seatDepth);
    const seatMesh = new THREE.Mesh(seatGeo, benchMaterial);
    seatMesh.position.y = seatHeight / 2;
    seatMesh.castShadow = true;
    seatMesh.receiveShadow = true;
    benchGroup.add(seatMesh);

    const benchBody = new CANNON.Body({ mass: 0 });
    const seatShape = new CANNON.Box(new CANNON.Vec3(seatWidth / 2, seatHeight / 2, seatDepth / 2));
    benchBody.addShape(seatShape, new CANNON.Vec3(0, seatHeight / 2, 0));
    benchBody.position.set(0, 0, 0);
    world.addBody(benchBody);

    const ceilingSize = hallSize;
    const ceilingYPos = wallHeight;

    const ceilingGeometry = new THREE.PlaneGeometry(ceilingSize, ceilingSize);
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x050505, side: THREE.DoubleSide });
    const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceilingMesh.position.set(0, ceilingYPos, 0);
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.receiveShadow = true;
    scene.add(ceilingMesh);

    const ceilingShape = new CANNON.Plane();
    const ceilingBody = new CANNON.Body({ mass: 0 });
    ceilingBody.addShape(ceilingShape);
    ceilingBody.position.set(0, ceilingYPos, 0);
    ceilingBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
    world.addBody(ceilingBody);

    const playerShape = new CANNON.Sphere(playerRadius);
    playerBody = new CANNON.Body({
        mass: playerMass,
        shape: playerShape,
        position: new CANNON.Vec3(0, playerRadius + 0.1, 5),
        linearDamping: 0.9,
        angularDamping: 1.0
    });
    playerBody.addEventListener("collide", onPlayerCollision);
    world.addBody(playerBody);

    const ethiopianFigures = [
        { name: "Emperor Haile Selassie I", lifespan: "1892-1975", description: "Ethiopia's last emperor and a defining figure in modern Ethiopian history.", achievement: "Reformed Ethiopia's government, established the Organization of African Unity, and became a symbol of African independence.", imageUrl: " https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/6553ea1081c347cfbbf9647d72632089.jpg " },
        { name: "Hachalu Hundessa", lifespan: "1986-2020", description: "Renowned Oromo singer, songwriter, and civil rights activist whose music became the soundtrack for a generation of political protests.", achievement: "Used his powerful voice and lyrics to advocate for the rights of the Oromo people and speak against political oppression.", imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/b2961240125547988bfdf1c4d274135b.jpg " },
        { name: "Tilahun Gessesse", lifespan: "1940-2009", description: "Known as 'The Voice' of Ethiopia's golden age of music.", achievement: "Received the lifetime achievement award from the Ethiopian Fine Art and Mass Media Prize Trust.", imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/0debf78a21fc49e8b8a618827277501c " },
        { name: "Abebe Bikila", lifespan: "1932-1973", description: "Ethiopian marathon runner who made history as the first African to win an Olympic gold medal.", achievement: "Won gold medals in the 1960 and 1964 Olympics.", imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/aac029be01d742bab802ccdc9fcb9d33.jpg " },
        { name: "Tsegaye Gebre-Medhin", lifespan: "1936-2006", description: "Ethiopia's Poet Laureate who wrote numerous plays, poems, and translations.", achievement: "Wrote over 30 plays, translated Shakespeare into Amharic.", imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/ebef8225ae244f969106028868379fc8.png " },
        { name: "Dawit Nega", lifespan: "1988-2022", description: "Beloved Tigrigna musician known for his powerful voice and emotional performances.", achievement: "Created hit songs including 'Babailey' and 'Qdus Tsebaya'.", imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/a78532be2bf94d91a1cc35d6e02aef72.jpg " },
        { name: "Emalaf Hiruy", lifespan: "20th century", description: "Pioneering Ethiopian artist who studied and taught modern art techniques while preserving traditional Ethiopian artistic expressions.", achievement: "Known for popularizing painting on Birana (animal skin canvas).", imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/bf9623a4ba0c45d39b7d893dca2c164a.jpg " },
        { name: "Yishak Gezahegn", lifespan: "Contemporary", description: "Contemporary Ethiopian artist whose work is deeply inspired by Ethiopian history, mystical arts, and ancient scrolls.", achievement: "Creates distinctive works incorporating traditional patterns and designs.", imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/f60f07dccfa1425bb45c91aa8efb3483.jpg " },
        { name: "Aleka Elias", lifespan: "19th-20th century", description: "Traditional Ethiopian artist who mastered and preserved the ancient technique of painting on Birana (animal skin canvas).", achievement: "Helped maintain Ethiopia's artistic heritage during periods of significant cultural change.", imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/57de1648f66d4becabd9b60da4f70ff1.webp " },
        { name: "Afework Gebreyesus", lifespan: "20th century", description: "Master calligrapher who specialized in Ethiopian calligraphy, preserving the artistic traditions of Ge'ez script.", achievement: "Created works that maintained Ethiopia's rich tradition of sacred calligraphy and manuscript illumination.", imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/be40345061e9464bbe7f8287ea4c5eb1.jpg " },
        { name: "Teklehawariyat Teklemariam", lifespan: "Late 19th-early 20th century", description: "Pioneer of Ethiopian theater who made history by writing and staging the first play produced in Ethiopia.", achievement: "Created 'The Jest of Animal Comedians' in 1904/5, establishing the foundation for Ethiopian theatrical traditions.", imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/01207167754447de9450d255debfbfcf.jpg " },
        { name: "Lázaro di Andrade", lifespan: "16th century", description: "Portuguese artist who lived in Ethiopia during the 16th century, creating a cultural bridge between European and Ethiopian artistic traditions.", achievement: "May have been involved in creating the 'Kwer'ata Re'esu' icon, one of Ethiopia's most significant religious artworks.", imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/7da07b3c517d4a129ace38007e3b5ddf.jpg " }
    ];

    const artworkImageUrls = ethiopianFigures.map(figure => figure.imageUrl);
    const artworkDepth = 0.05;
    const baseArtworkHeight = 2.5;
    const artworkYPos = wallHeight / 2.2;

    const createArtwork = (x, y, z, rotationY, imageUrl) => {
        const artworkGroup = new THREE.Group();
        artworkGroup.position.set(x, y, z);
        artworkGroup.rotation.y = rotationY;
        scene.add(artworkGroup);

        if (imageUrl) {
            textureLoader.load(
                imageUrl,
                (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    const aspectRatio = texture.image.naturalWidth / texture.image.naturalHeight;
                    const artworkHeight = baseArtworkHeight;
                    const artworkWidth = artworkHeight * aspectRatio;
                    const artworkGeo = new THREE.BoxGeometry(artworkWidth, artworkHeight, artworkDepth);
                    const artworkMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7, metalness: 0.1 });
                    const artworkMesh = new THREE.Mesh(artworkGeo, artworkMaterial);
                    artworkMesh.castShadow = true;
                    artworkMesh.receiveShadow = true;
                    artworkGroup.add(artworkMesh);
                    artworkMesh.userData.artworkIndex = artIndex - 1;
                    artworkMeshes.push(artworkMesh);
                },
                undefined,
                (err) => {
                    console.error(`An error occurred loading artwork: ${imageUrl}`, err);
                    const fallbackGeo = new THREE.BoxGeometry(baseArtworkHeight * 0.75, baseArtworkHeight, artworkDepth);
                    const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0x550000 });
                    const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMaterial);
                    artworkGroup.add(fallbackMesh);
                    fallbackMesh.userData.artworkIndex = artIndex - 1;
                    artworkMeshes.push(fallbackMesh);
                }
            );
        } else {
            const fallbackGeo = new THREE.BoxGeometry(baseArtworkHeight * 0.75, baseArtworkHeight, artworkDepth);
            const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.0 });
            const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMaterial);
            artworkGroup.add(fallbackMesh);
        }
    };

    let artIndex = 0;
    const getNextImageUrl = () => (artIndex < artworkImageUrls.length) ? artworkImageUrls[artIndex++] : null;

    const ARTWORK_PLACEMENT_Y = artworkYPos;
    const ARTWORK_PLACEMENT_Y_HIGH = 4.5;
    const artworkOffsetFromWallTowardCenter = 0.3;
    const artworkCenterCoordinateMagnitude = hallSize / 2 - 0.25 / 2 - artworkDepth / 2 - artworkOffsetFromWallTowardCenter;
    const ART_PLACEMENT_NEG_AXIS = -artworkCenterCoordinateMagnitude;
    const ART_PLACEMENT_POS_AXIS = artworkCenterCoordinateMagnitude;

    const ALONG_WALL_OFFSET_CENTER = 0;
    const ALONG_WALL_OFFSET_SIDE = hallSize / 3.5;
    const ALONG_WALL_OFFSET_BACK_HIGH_LEFT_X = -hallSize / 8;

    createArtwork(-ALONG_WALL_OFFSET_SIDE, ARTWORK_PLACEMENT_Y, ART_PLACEMENT_NEG_AXIS, 0, getNextImageUrl());
    createArtwork(ALONG_WALL_OFFSET_SIDE, ARTWORK_PLACEMENT_Y, ART_PLACEMENT_NEG_AXIS, 0, getNextImageUrl());
    createArtwork(ALONG_WALL_OFFSET_CENTER, ARTWORK_PLACEMENT_Y, ART_PLACEMENT_NEG_AXIS, 0, getNextImageUrl());

    createArtwork(-ALONG_WALL_OFFSET_SIDE, ARTWORK_PLACEMENT_Y, ART_PLACEMENT_POS_AXIS, Math.PI, getNextImageUrl());
    createArtwork(ALONG_WALL_OFFSET_SIDE, ARTWORK_PLACEMENT_Y, ART_PLACEMENT_POS_AXIS, Math.PI, getNextImageUrl());
    createArtwork(ALONG_WALL_OFFSET_CENTER, ARTWORK_PLACEMENT_Y, ART_PLACEMENT_POS_AXIS, Math.PI, getNextImageUrl());

    createArtwork(ART_PLACEMENT_NEG_AXIS, ARTWORK_PLACEMENT_Y, -ALONG_WALL_OFFSET_SIDE, Math.PI / 2, getNextImageUrl());
    createArtwork(ART_PLACEMENT_NEG_AXIS, ARTWORK_PLACEMENT_Y, ALONG_WALL_OFFSET_CENTER, Math.PI / 2, getNextImageUrl());
    createArtwork(ART_PLACEMENT_NEG_AXIS, ARTWORK_PLACEMENT_Y, ALONG_WALL_OFFSET_SIDE, Math.PI / 2, getNextImageUrl());

    createArtwork(ART_PLACEMENT_POS_AXIS, ARTWORK_PLACEMENT_Y, -ALONG_WALL_OFFSET_SIDE, -Math.PI / 2, getNextImageUrl());
    createArtwork(ART_PLACEMENT_POS_AXIS, ARTWORK_PLACEMENT_Y, ALONG_WALL_OFFSET_CENTER, -Math.PI / 2, getNextImageUrl());
    createArtwork(ART_PLACEMENT_POS_AXIS, ARTWORK_PLACEMENT_Y, ALONG_WALL_OFFSET_SIDE, -Math.PI / 2, getNextImageUrl());

    function createWall(width, height, depth, x, y, z, rotationY = 0) {
        const wallGeo = new THREE.BoxGeometry(width, height, depth);
        const wallMesh = new THREE.Mesh(wallMaterial, wallGeo);
        wallMesh.position.set(x, y, z);
        if (rotationY !== 0) wallMesh.rotation.y = rotationY;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        scene.add(wallMesh);
        const wallShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
        const wallBody = new CANNON.Body({ mass: 0 });
        wallBody.addShape(wallShape);
        wallBody.position.set(x, y, z);
        if (rotationY !== 0) wallBody.quaternion.setFromEuler(0, rotationY, 0);
        world.addBody(wallBody);
    }

    const wallYPos = wallHeight / 2;
    const halfHallSize = hallSize / 2;

    createWall(hallSize, wallHeight, 0.5, 0, wallYPos, halfHallSize - 0.25);
    createWall(hallSize, wallHeight, 0.5, 0, wallYPos, -halfHallSize + 0.25);
    createWall(0.5, wallHeight, hallSize, halfHallSize - 0.25, wallYPos, 0, 0);
    createWall(0.5, wallHeight, hallSize, -halfHallSize + 0.25, wallYPos, 0, 0);

    const instructions = document.createElement('div');
    instructions.innerHTML = 'Click to play';
    instructions.style.position = 'absolute';
    instructions.style.top = '50%';
    instructions.style.left = '50%';
    instructions.style.transform = 'translate(-50%, -50%)';
    instructions.style.fontSize = '24px';
    instructions.style.color = 'white';
    instructions.style.backgroundColor = 'rgba(0,0,0,0.5)';
    instructions.style.padding = '10px';
    instructions.style.cursor = 'pointer';
    document.body.appendChild(instructions);
    instructions.addEventListener('click', () => {
        document.body.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', onPointerLockChange, false);
    document.addEventListener('pointerlockerror', onPointerLockError, false);
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    document.addEventListener('mousemove', updateMousePosition, false);
    window.addEventListener('resize', onWindowResize, false);

    animate();
}

function onPointerLockChange() {
    if (document.pointerLockElement === document.body) {
        controlsEnabled = true;
        const instructions = document.querySelector('div[style*="absolute"]');
        if (instructions) instructions.style.display = 'none';
    } else {
        controlsEnabled = false;
        const instructions = document.querySelector('div[style*="absolute"]');
        if (instructions) instructions.style.display = 'block';
    }
}

function onPointerLockError() {
    console.error('PointerLock Error');
}

function onMouseMove(event) {
    if (!controlsEnabled) return;
    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
    _euler.setFromQuaternion(camera.quaternion);
    _euler.y -= movementX * 0.002;
    _euler.x -= movementY * 0.002;
    _euler.x = Math.max(minPitchAngle, Math.min(maxPitchAngle, _euler.x));
    camera.quaternion.setFromEuler(_euler);
}

function updateMousePosition(event) {
    mouse.x = 0;
    mouse.y = 0;
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space': if (isOnGround) canJump = true; break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
    }
}

function onPlayerCollision({ contact }) {
    const contactNormal = new CANNON.Vec3();
    const upAxis = new CANNON.Vec3(0, 1, 0);
    if (contact.bi.id === playerBody.id) {
        contact.ni.negate(contactNormal);
    } else {
        contactNormal.copy(contact.ni);
    }
    if (contactNormal.dot(upAxis) > 0.5) {
        isOnGround = true;
    }
}

function updatePlayer(deltaTime) {
    if (!controlsEnabled && !playerBody) return;
    const inputVelocity = new THREE.Vector3();
    const cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    cameraEuler.setFromQuaternion(camera.quaternion);
    const movementEuler = new THREE.Euler(0, cameraEuler.y, 0, 'YXZ');

    if (moveForward) inputVelocity.z = -playerMoveSpeed;
    if (moveBackward) inputVelocity.z = playerMoveSpeed;
    if (moveLeft) inputVelocity.x = -playerMoveSpeed;
    if (moveRight) inputVelocity.x = playerMoveSpeed;

    inputVelocity.applyEuler(movementEuler);
    playerBody.velocity.x = inputVelocity.x;
    playerBody.velocity.z = inputVelocity.z;

    if (canJump && isOnGround) {
        playerBody.velocity.y = playerJumpVelocity;
        canJump = false;
        isOnGround = false;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function showFigureInfo(figureIndex) {
    if (figureIndex === undefined || figureIndex < 0 || figureIndex >= ethiopianFigures.length) {
        hideInfoOverlay();
        return;
    }
    const figure = ethiopianFigures[figureIndex];
    document.getElementById('figureName').textContent = figure.name;
    document.getElementById('figureLifespan').textContent = figure.lifespan;
    document.getElementById('figureDescription').textContent = figure.description;
    document.getElementById('figureAchievement').textContent = figure.achievement;
    infoOverlay.style.display = 'block';
}

function hideInfoOverlay() {
    if (infoOverlay) {
        infoOverlay.style.display = 'none';
    }
    currentlyViewedArtwork = null;
}

function checkArtworkView() {
    if (!camera || !raycaster || !artworkMeshes.length) return;
    const now = Date.now();
    if (now - lastInfoUpdateTime < INFO_UPDATE_INTERVAL) return;
    lastInfoUpdateTime = now;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(artworkMeshes);
    if (intersects.length > 0) {
        const artworkIndex = intersects[0].object.userData.artworkIndex;
        if (currentlyViewedArtwork !== artworkIndex) {
            currentlyViewedArtwork = artworkIndex;
            showFigureInfo(artworkIndex);
        }
    } else if (currentlyViewedArtwork !== null) {
        hideInfoOverlay();
    }
}

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();
    if (controlsEnabled || document.pointerLockElement === document.body) {
        updatePlayer(deltaTime);
        checkArtworkView();
    }
    if (world) {
        world.step(cannonStep, deltaTime, 3);
        scene.traverse(function(object) {
            if (object.isMesh && object.userData.physicsBody && object.userData.physicsBody !== playerBody) {
                object.position.copy(object.userData.physicsBody.position);
                object.quaternion.copy(object.userData.physicsBody.quaternion);
            }
        });
        if (playerBody) {
            const targetPosition = new THREE.Vector3();
            targetPosition.copy(playerBody.position);
            targetPosition.y += playerEyeHeight;
            camera.position.lerp(targetPosition, 0.2);
        }
    }
    renderer.render(scene, camera);
}

init();

//dagi make's stuff lol forget about the mit and use it
