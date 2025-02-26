import {
  _decorator,
  find,
  Component,
  KeyCode,
  input,
  RigidBody2D,
  EventKeyboard,
  Input,
  v2,
  Node,
  Prefab,
  BoxCollider2D,
  Contact2DType,
  Collider2D,
  IPhysics2DContact,
  instantiate,
  math,
  EventMouse,
  UITransform,
  v3,
  Sprite,
  Color,
  ProgressBar,
  Game,
  AnimationComponent,
  AudioSource,
  AudioClip,
  director,
} from "cc";

import GlobalManager from "./Manager/GlobalManager";
import { PlayerManager } from "./Manager/PlayerManager";
import PhotonManager from "./Manager/PhotonManager";
import GameManager from "./Manager/GameManager";
import { Setting } from "./Setting";
import { userIdList } from "./Manager/PlayerManager";
import { MultiRoom } from "./MultiRoom";

const { ccclass, property } = _decorator;

// In the Fucntion "handlePlayerShoot"
// There is a line need to be changed

@ccclass("PlayerPrefab")
export class PlayerPrefab extends Component {
  @property
  public playerSpeed: number = 10;

  @property(Prefab)
  public bulletPrefab: Prefab = null;

  @property(Prefab)
  bulletPrefab2: Prefab;
  @property(Prefab)
  bulletPrefab3: Prefab;
  @property(Prefab)
  bulletPrefab4: Prefab;

  @property({ type: AnimationComponent })
  animation: AnimationComponent = null;

  @property(Prefab)
  public weapon_1: Prefab = null;
  @property(Prefab)
  public weapon_2: Prefab = null;
  @property(Prefab)
  public weapon_3: Prefab = null;
  @property(Prefab)
  public weapon_4: Prefab = null;
  @property(Prefab)
  public weapon_5: Prefab = null;

  @property(Prefab)
  public itemPrefab: Prefab = null;

  @property(Prefab)
  public healthBarPrefab: Prefab = null;

  @property
  public health: number = 100;

  @property
  public playerIndex: number;

  @property(AudioClip)
  public bulletAudio: AudioClip = null;

  @property(AudioClip)
  public deadAudio: AudioClip = null;

  static itemBar: Node = null;

  // The path of the important Node in the scene
  private photonManagerPath: string = "Canvas/PhotonManager";
  private playerManagerPath: string = "Canvas/PlayerManager";
  private bulletLayerPath: string = "Canvas/BulletPool";

  // The Node in the scene
  private photonManager = null;
  private playerManager = null;
  private selectedPlayerIndex = 0;
  private deathCount = 0;

  //private PlayerIndex: number = 0;
  public character: string = "Wizard";

  // The properties of the bullet
  private bulletSpeed = 25;
  private fireRate = 0.2;
  private shootInterval = 0;

  // The properties of the player
  private preDir: string = "RIGHT";
  private dirX = 0;
  private dirY = 0;
  public angle = 0;
  private curItem: number = 0; // 0: weapon, 1: item

  // Some flags for judging the state of the player
  private isNodePooling = true;
  private isDragging = false;
  private isShooting = false;
  private isDead = false;

  // ChildNode
  public itemNode = null;
  public gunNode = null;
  public healthBarNode = null;
  public SelfLabel = null;

  onLoad(): void {
    this.playerManager = find(this.playerManagerPath).getComponent(
      PlayerManager
    );
    this.initHealthBarNode();
    this.photonManager = PhotonManager.instance;
    console.log(this.photonManager.getLoadBalancingClient());
    this.deathCount = 0;
    this.isNodePooling = this.playerManager.PoolMode;
    this.initGunNode();
    // this.initHealthBarNode();
    this.selectedPlayerIndex = GlobalManager.instance.selectedPlayerIndex;

    // PlayerPrefab.itemBar = instantiate(this.itemPrefab);
    // PlayerPrefab.itemBar.position = v3(304.476, -223.456, 0);
    // find("Canvas/Camera").addChild(PlayerPrefab.itemBar);
    //string to number
  }

  start() {
    this.handleListener("LOAD");
    this.getComponent(AudioSource).volume = Setting.BGMvolume * 2;

    if (this.playerIndex === this.selectedPlayerIndex) {
      this.node.getChildByName("SelfLabel").active = true;
      console.log("Player", this.playerIndex, "is selected");

      //   PlayerPrefab.itemBar = instantiate(this.itemPrefab);
      //   PlayerPrefab.itemBar.position = v3(304.476, -223.456, 0);
      //   find("Canvas/Camera").addChild(PlayerPrefab.itemBar);
    } else {
      this.node.getChildByName("SelfLabel").active = false;
      console.log("Player", this.playerIndex, "is not selected");
    }

    this.animation = this.node.getComponent(AnimationComponent);
    if (this.dirX === 0 && this.dirY === 0) {
      this.animation.play(this.character + "_Idle");
    }

    console.log(this.photonManager.getLoadBalancingClient().myRoom());
    console.log(this.photonManager.getLoadBalancingClient().isJoinedToRoom());
  }

  onDestroy() {
    this.handleListener("UNLOAD");
  }

  receiveDeathEvent() {
    this.deathCount++;
    console.log("Death Count: " + this.deathCount);
    if (this.deathCount == PlayerManager.userNumber - 1) {
        const roomID = MultiRoom.roomID;
        const roomRef = firebase.database().ref("rooms/" + roomID);

        roomRef.remove()
            .then(() => {
                console.log("Room removed successfully");
                this.photonManager.getLoadBalancingClient().leaveRoom();
      director.loadScene("winScene");
            })
            .catch((error) => {
                console.error("Error removing room: ", error);
            });
    }
  }

  update(deltaTime: number) {
    if (this.playerIndex === this.selectedPlayerIndex) {
      //console.log("this player index is" + this.playerIndex + "selected player index is" + this.selectedPlayerIndex);
      let playerBody = this.node.getComponent(RigidBody2D);
      if (playerBody) {
        this.handlePlayerPosition();
        this.sendPosition();

        if (this.isShooting) {
          this.shootInterval -= deltaTime;
          if (this.shootInterval <= 0) {
            this.handlePlayerShoot();
            this.shootInterval = this.fireRate;
          }
        } else {
          let playerBody = this.node.getComponent(RigidBody2D);
          if (playerBody) {
            this.handlePlayerPosition();
          }
        }

        if (this.curItem === 0) {
          if (this.gunNode) {
            this.gunNode.active = true;
            this.itemNode.active = false;
          }
          PlayerPrefab.itemBar
            .getChildByPath("Weapon/filter").active = true;
          PlayerPrefab.itemBar
            .getChildByPath("Item/filter").active = false;
        } else {
          if (this.gunNode) this.gunNode.active = false;
          const item = PlayerPrefab.itemBar
            .getChildByPath("Item/ItemSprite")
            .getComponent(Sprite).spriteFrame;

          if (item != null && item.name !== "") {
            this.itemNode.getComponent(Sprite).spriteFrame = item;
            this.itemNode.active = true;
          } else this.itemNode.active = false;

          PlayerPrefab.itemBar
            .getChildByPath("Weapon/filter").active = false;
          PlayerPrefab.itemBar
            .getChildByPath("Item/filter").active = true;
        }
      }
    }
    this.updateHealthBar();
    console.log(this.playerIndex, this.character);
  }

  updateHealthBar() {
    let healthBar = null;
    if (this.healthBarNode != null) {
      healthBar = this.healthBarNode.getComponent(ProgressBar);
    }
    try {
      healthBar.progress = this.health / 100;
      console.log("Health Bar Updated");
    } catch (error) {
      console.log("Health Bar Node not found");
    }
  }

  initGunNode() {
    this.gunNode = instantiate(this.weapon_5);
    this.gunNode.parent = this.node;
    this.gunNode.name = "Gun";
    this.gunNode.setPosition(0, -40);

    this.itemNode = new Node();
    this.itemNode.addComponent(Sprite);
    this.itemNode.parent = this.node;
    this.itemNode.name = "Item";
    this.itemNode.setPosition(0, -40);
  }

  initHealthBarNode() {
    this.healthBarNode = this.node.getChildByName("HealthBar");
    if (this.healthBarNode == null) {
      console.log("null");
    } else {
      console.log("find bar");
    }
    // player position + offset
    //this.healthBarNode.setPosition(this.node.position.x, this.node.position.y);
  }

  sendPosition() {
    const position = this.node.position;
    if (this.photonManager.getLoadBalancingClient().isJoinedToRoom()) {
      this.photonManager.sendEvent(4, {
        x: position.x,
        y: position.y,
        angle: this.angle,
        PlayerIndex: this.playerIndex,
        face: this.node.scale.x,
      });
    }
  }

  handlePlayerPosition() {
    let playerBody = this.node.getComponent(RigidBody2D);
    playerBody.linearVelocity = v2(
      this.dirX * this.playerSpeed,
      this.dirY * this.playerSpeed
    );

    let playerFace: number[] = [1, 1];
    switch (this.preDir) {
      case "RIGHT":
        playerFace = [1, 1];
        break;
      case "LEFT":
        playerFace = [-1, 1];
        break;
    }
    this.node.setScale(playerFace[0], playerFace[1]);

    this.gunNode.setRotationFromEuler(0, 0, this.angle);
  }

  handlePlayerShoot() {
    // First create a bullet
    let bullet = null;
    if (this.playerIndex === this.selectedPlayerIndex) this.sendShootEvent();
    if (this.isNodePooling) {
      bullet = this.playerManager.createBullet(this.playerIndex);
    } else {
      if (this.playerIndex == 1) {
        bullet = instantiate(this.bulletPrefab);
      } else if (this.playerIndex == 2) {
        bullet = instantiate(this.bulletPrefab2);
      } else if (this.playerIndex == 3) {
        bullet = instantiate(this.bulletPrefab3);
      } else if (this.playerIndex == 4) {
        bullet = instantiate(this.bulletPrefab4);
      }
    }
    this.getComponent(AudioSource).clip = this.bulletAudio;
    this.getComponent(AudioSource).play();

    // Assign the bullet to the bullet layer
    bullet.parent = find(this.bulletLayerPath);
    let bulletBody = bullet.getComponent(RigidBody2D);

    let bulletPosX: number,
      bulletPosY: number,
      bulletDir: number[] = [0, 0];

    bulletDir = this.changeAngleToUnitVec();
    bulletDir[0] = bulletDir[0] * this.node.scale.x;

    bulletPosX = this.node.position.x + bulletDir[0] * 40;
    bulletPosY = this.node.position.y + bulletDir[1] * 35 - 40;

    bullet.setPosition(bulletPosX, bulletPosY);

    bulletBody.linearVelocity = v2(
      bulletDir[0] * this.bulletSpeed,
      bulletDir[1] * this.bulletSpeed
    );
  }

  handlePickItem() {
    GameManager.isPickup = true;
    console.log("is picking up");
  }

  handleUseItem() {
    console.log("is using item");
    const item = PlayerPrefab.itemBar
      .getChildByPath("Item/ItemSprite")
      .getComponent(Sprite).spriteFrame;
    if (item !== null) {
      if (item.name === "healing") {
        console.log("healing");
        if (this.health + 50 > 100) {
          this.health = 100;
        } else {
          this.health += 50;
        }
      } else if (item.name === "speedUp") {
        console.log("sppeedUp");
        this.playerSpeed = 15;
        this.scheduleOnce(() => {
          this.playerSpeed = 10;
        }, 3);
      }
      PlayerPrefab.itemBar
        .getChildByPath("Item/ItemSprite")
        .getComponent(Sprite).spriteFrame = null;
    } else {
      return;
    }
  }

  async onBeginContact(
    selfCollider: Collider2D,
    otherCollider: Collider2D,
    contact: IPhysics2DContact
  ) {
    if (
      otherCollider.node.name === "Bullet" &&
      this.playerIndex === this.selectedPlayerIndex
      && otherCollider.tag !== this.selectedPlayerIndex
    ) {
      this.updateHealth(-10);
      if (this.health <= 0 && !this.isDead) {
        this.isDead = true;
        console.log("bullet tag", otherCollider.tag);
        console.log("id", userIdList[otherCollider.tag - 4]);
        const killRef = firebase.database().ref("users/" + userIdList[otherCollider.tag - 4] + "/kill");
        const snapshot = await killRef.once('value');
        if (snapshot.exists()) {
          const killData = snapshot.val();
          await killRef.set(killData + 1);
          // const snapshot2 = await killRef.once('value');
          // console.log("Death data:", snapshot2.val());
          
        } else {
          console.log("No data available at the specified path.");
          await killRef.set(1);
        }
        this.handlePlayerDeath();
      }
      this.sendUpdateHealth(-10);
    }
  }

  updateHealth(amount: number) {
    this.health += amount;
    console.log(`Health updated: ${this.health}`);
    if (this.health <= 0) {
      console.log("Player", this.playerIndex, "is dead");
      //this.node.destroy();
    } else {
      // --Waiting For Change--
      //Here need to change the node to the health bar
      //this.node.setScale(this.health / 100, 1);
    }
  }

  async handlePlayerDeath() {
    
    if (this.photonManager.getLoadBalancingClient().isJoinedToRoom()) {
      this.photonManager.sendEvent(6, {
        PlayerIndex: this.playerIndex,
        Death: true,
      });
    }
    console.log("Player", this.playerIndex, "is dead");
    const curUser = await firebase.auth().currentUser;
    const userRef = firebase.database().ref("users/" + curUser.uid);
    console.log("UserRef: ", userRef);
    userRef.once("value", (snapshot) => {
      if (snapshot.exists()) {
        const user = snapshot.val();
        user.death += 1;
        userRef.update(user);
        console.log("Death Count Updated!!");
      }
    });
    this.gunNode.destroy();

    this.getComponent(AudioSource).clip = this.deadAudio;
    this.getComponent(AudioSource).volume = Setting.EffectVolume * 2;
    this.getComponent(AudioSource).play();
    
    this.animation.play(this.character + "_Dead");
    this.scheduleOnce(() => {
      this.photonManager.getLoadBalancingClient().leaveRoom();
      this.node.destroy();
      director.loadScene("loseScene");
    }, 1);
  }

  handleSupportPlayerDeath() {
    this.gunNode.destroy();

    this.getComponent(AudioSource).clip = this.deadAudio;
    this.getComponent(AudioSource).volume = Setting.EffectVolume * 2;
    this.getComponent(AudioSource).play();
    
    this.animation.play(this.character + "_Dead");
    this.scheduleOnce(() => {
      this.node.destroy();
    }, 1);
  }

  // The function to handle the listener
  // Use "LOAD" to open the listener
  // Use "UNLOAD" to close the listener
  handleListener(mode: string) {
    // judge is the current user
    if (mode === "LOAD") {
      let collider = this.node.getComponent(BoxCollider2D);
      if (collider) {
        collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
      }

      input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
      input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
      input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
      input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
      input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
      input.on(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    } else if (mode === "UNLOAD") {
      let collider = this.node.getComponent(BoxCollider2D);
      if (collider) {
        collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
      }

      input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
      input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
      input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
      input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
      input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
      input.off(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    }
  }

  // Use the angle to calculate the unit vector
  changeAngleToUnitVec() {
    let radian =
      this.angle >= 0
        ? math.toRadian(this.angle)
        : math.toRadian(360 + this.angle);

    return [Math.cos(radian), Math.sin(radian)];
  }

  private onKeyDown(event: EventKeyboard) {
    switch (event.keyCode) {
      case KeyCode.KEY_W:
        this.dirY = 1;
        this.preDir = "UP";
        if (this.playerIndex === this.selectedPlayerIndex) {
          this.animation.play(this.character + "_Run");
          this.sendAnimation("_Run");
        }
        // console.log("up");
        break;
      case KeyCode.KEY_S:
        this.dirY = -1;
        this.preDir = "DOWN";
        if (this.playerIndex === this.selectedPlayerIndex) {
          this.animation.play(this.character + "_Run");
          this.sendAnimation("_Run");
        }
        // console.log("down");
        break;
      case KeyCode.KEY_A:
        this.dirX = -1;
        this.preDir = "LEFT";
        this.sendFaceDirection();
        if (this.playerIndex === this.selectedPlayerIndex) {
          this.animation.play(this.character + "_Run");
          this.sendAnimation("_Run");
        }
        // console.log("left");
        break;
      case KeyCode.KEY_D:
        this.dirX = 1;
        this.preDir = "RIGHT";
        this.sendFaceDirection();
        if (this.playerIndex === this.selectedPlayerIndex) {
          this.animation.play(this.character + "_Run");
          this.sendAnimation("_Run");
        }
        // console.log("right");
        break;
      case KeyCode.KEY_K:
        this.isShooting = true;
        break;
      case KeyCode.KEY_F:
        this.handlePickItem();
        break;
    }
  }

  private onKeyUp(event: EventKeyboard) {
    switch (event.keyCode) {
      case KeyCode.KEY_W:
        this.dirY = 0;
        break;
      case KeyCode.KEY_S:
        this.dirY = 0;
        break;
      case KeyCode.KEY_A:
        this.dirX = 0;
        break;
      case KeyCode.KEY_D:
        this.dirX = 0;
        break;
      case KeyCode.KEY_K:
        this.isShooting = false;
        break;
    }
    if (
      this.dirX === 0 &&
      this.dirY === 0 &&
      this.playerIndex === this.selectedPlayerIndex
    ) {
      this.animation.play(this.character + "_Idle");
      this.sendAnimation("_Idle");
    }
  }

  private onMouseMove(e: EventMouse) {
    if (this.isDragging) {
      let deltaDist = this.node.parent
        .getComponent(UITransform)
        .convertToNodeSpaceAR(v3(e.getUILocation().x, e.getUILocation().y, 0));

      this.angle = math.toDegree(Math.atan2(deltaDist.y, deltaDist.x));
    }
  }

  private onMouseDown(e: EventMouse) {
    switch (e.getButton()) {
      case 2: // BUTTON_RIGHT
        this.isDragging = true;
        break;
      case 0: // BUTTON_LEFT
        if (this.curItem === 0) {
          this.isShooting = true;
        } else {
          this.handleUseItem();
        }
        break;
    }
  }

  private onMouseUp(e: EventMouse) {
    switch (e.getButton()) {
      case 2: // BUTTON_RIGHT
        this.isDragging = false;
        break;
      case 0: // BUTTON_LEFT
        this.isShooting = false;
        break;
    }
  }

  private onMouseWheel(e: EventMouse) {
    // console.log(e.getScrollY());
    if (e.getScrollY() > 50) {
      this.curItem = 1;
    } else if (e.getScrollY() < -50) {
      this.curItem = 0;
    }
  }

  sendUpdateHealth(damage: number) {
    if (this.photonManager) {
      this.photonManager.sendEvent(2, {
        // 假设 '2' 是更新血量的事件代码
        PlayerIndex: this.playerIndex,
        Damage: damage,
      });
    }
  }

  sendFaceDirection() {
    if (this.photonManager) {
      this.photonManager.sendEvent(3, {
        PlayerIndex: this.playerIndex,
        face: this.node.scale.x,
      });
    }
  }

  sendAnimation(animationName: string) {
    if (this.photonManager) {
      this.photonManager.sendEvent(5, {
        PlayerIndex: this.playerIndex,
        animationName: animationName,
      });
    }
  }

  //send Shoot Event
  sendShootEvent() {
    if (this.photonManager) {
      this.photonManager.sendEvent(1, {
        PlayerIndex: this.playerIndex,
      });
      console.log("Send Shoot Event");
    }
  }

  setSkin(skin: string) {
    this.character = skin;
  }

  setAnimation(animationName: string) {
    console.log(
      "Animation Name: ",
      animationName,
      "Player Index: ",
      this.playerIndex
    );
    this.animation.play(this.character + animationName);
  }
}
