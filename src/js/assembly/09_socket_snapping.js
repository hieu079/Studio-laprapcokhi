    function getWorldSocketPosition(part, socket) {
      part.updateMatrixWorld(true);
      return new THREE.Vector3(socket.x, socket.y, socket.z).applyMatrix4(part.matrixWorld);
    }

    function getLocalHoleCenter(socket) {
      const center = new THREE.Vector3(socket.x, socket.y, socket.z);
      if (socket.dir === 'vertical') center.y -= socket.y * 2;
      return center;
    }

    function getWorldHoleCenter(part, socket) {
      const surfacePosition = getWorldSocketPosition(part, socket);
      if (socket.dir !== 'vertical' || Math.abs(socket.y) < 0.001) return surfacePosition;

      const inwardOffset = new THREE.Vector3(0, socket.y * 2, 0)
        .applyQuaternion(part.quaternion);
      return surfacePosition.sub(inwardOffset);
    }

    function areSocketAxesParallel(firstPart, secondPart) {
      const localAxis = new THREE.Vector3(0, 1, 0);
      const firstAxis = localAxis.clone().applyQuaternion(firstPart.getWorldQuaternion(new THREE.Quaternion()));
      const secondAxis = localAxis.clone().applyQuaternion(secondPart.getWorldQuaternion(new THREE.Quaternion()));
      return Math.abs(firstAxis.dot(secondAxis)) >= 0.95;
    }

    function shouldSnapToOppositeHoleFace(part, pin, pinSocket, pinQuaternion = null) {
      const pinAxis = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(pinQuaternion || pin.getWorldQuaternion(new THREE.Quaternion()));
      const componentAxis = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(part.getWorldQuaternion(new THREE.Quaternion()));
      return pinSocket.y * pinAxis.dot(componentAxis) < 0;
    }

    function getComponentSnapPosition(part, componentSocket, pinSocket, pin, pinQuaternion = null) {
      const surfacePosition = getWorldSocketPosition(part, componentSocket);
      if (pinSocket.snapToHoleCenter) {
        return surfacePosition.add(getWorldHoleCenter(part, componentSocket)).multiplyScalar(0.5);
      }
      return shouldSnapToOppositeHoleFace(part, pin, pinSocket, pinQuaternion)
        ? getWorldHoleCenter(part, componentSocket)
        : surfacePosition;
    }

    function getLocalComponentSnapPosition(componentSocket, pinSocket, part, pin) {
      const surfacePosition = new THREE.Vector3(componentSocket.x, componentSocket.y, componentSocket.z);
      if (pinSocket.snapToHoleCenter) {
        return surfacePosition.add(getLocalHoleCenter(componentSocket)).multiplyScalar(0.5);
      }
      return shouldSnapToOppositeHoleFace(part, pin, pinSocket)
        ? getLocalHoleCenter(componentSocket)
        : surfacePosition;
    }

    function getMagneticPartners(part) {
      const partners = [];
      joints.forEach(j => {
        if (!j.id.startsWith('magnetic_joint_')) return;
        if (j.partA === part && j.partB && !partners.includes(j.partB)) partners.push(j.partB);
        if (j.partB === part && j.partA && !partners.includes(j.partA)) partners.push(j.partA);
      });
      return partners;
    }

    function getMagneticRotationConstraint(part) {
      const connections = joints.flatMap(j => {
        if (!j.id.startsWith('magnetic_joint_')) return [];
        if (part?.userData?.isPin && j.partA === part && j.partB && !j.partB.userData?.isPin) {
          return [{ pin: part, pinSocket: j.socketA, componentSocket: j.socketB }];
        }
        if (part?.userData?.isPin && j.partB === part && j.partA && !j.partA.userData?.isPin) {
          return [{ pin: part, pinSocket: j.socketB, componentSocket: j.socketA }];
        }
        if (j.partA === part && j.partB?.userData?.isPin) {
          return [{ pin: j.partB, pinSocket: j.socketB, componentSocket: j.socketA }];
        }
        if (j.partB === part && j.partA?.userData?.isPin) {
          return [{ pin: j.partA, pinSocket: j.socketA, componentSocket: j.socketB }];
        }
        return [];
      });
      return {
        connections,
        connection: connections[0] || null,
        locked: (part?.userData?.isPin && connections.length > 0) || connections.length >= 2
      };
    }

    function keepMagneticConnectionAnchored(part, connection) {
      const localAnchor = getLocalComponentSnapPosition(
        connection.componentSocket,
        connection.pinSocket,
        part,
        connection.pin
      );
      const worldAnchorOffset = localAnchor.applyQuaternion(part.getWorldQuaternion(new THREE.Quaternion()));
      const pinSocketWorldPosition = getWorldSocketPosition(connection.pin, connection.pinSocket);
      const desiredWorldPosition = pinSocketWorldPosition.sub(worldAnchorOffset);

      if (part.parent) {
        part.position.copy(part.parent.worldToLocal(desiredWorldPosition));
      } else {
        part.position.copy(desiredWorldPosition);
      }
      part.updateMatrixWorld(true);
    }

    function getPartRotationAxis(part, connection = null) {
      const axis = connection
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
      const reference = connection?.pin || part;
      return axis.applyQuaternion(reference.getWorldQuaternion(new THREE.Quaternion())).normalize();
    }

    function getPartLocalAxisNameForWorldAxis(part, worldAxis) {
      const quaternion = part.getWorldQuaternion(new THREE.Quaternion());
      const axes = {
        X: new THREE.Vector3(1, 0, 0),
        Y: new THREE.Vector3(0, 1, 0),
        Z: new THREE.Vector3(0, 0, 1)
      };
      return Object.entries(axes).reduce((closest, [name, axis]) => {
        const alignment = Math.abs(axis.applyQuaternion(quaternion).dot(worldAxis));
        return alignment > closest.alignment ? { name, alignment } : closest;
      }, { name: 'Y', alignment: -1 }).name;
    }

    function canMagneticallyReattach(part, targetPart) {
      const releaseParts = part.userData.magneticReleaseParts || [];
      if (!releaseParts.includes(targetPart)) return true;

      const origin = part.userData.magneticReleaseOrigin;
      const current = part.getWorldPosition(new THREE.Vector3());
      if (!origin || current.distanceTo(origin) > 0.65) {
        part.userData.magneticReleaseParts = [];
        part.userData.magneticReleaseOrigin = null;
        return true;
      }
      return false;
    }

    function findNearestPinSnap(pin, maxDistance = 1.0) {
      const pinSockets = pin.userData.holes || [];
      let nearest = null;
      pin.updateMatrixWorld(true);

      const pinWorldPosition = pin.getWorldPosition(new THREE.Vector3());
      const preserveOrientation = pin.userData.magneticPreserveOrientationDuringDrag;
      const pinLocalBounds = getPinLocalBounds(pin);

      for (const pinSocket of pinSockets) {
        for (const targetPart of parts) {
          if (targetPart === pin || targetPart.userData?.isPin) continue;
          if (!canMagneticallyReattach(pin, targetPart)) continue;
          if (preserveOrientation && !areSocketAxesParallel(pin, targetPart)) continue;
          if (isMagneticSocketOccupied(pin, pinSocket, targetPart)) continue;

          for (const targetSocket of targetPart.userData?.holes || []) {
            if (isMagneticSocketOccupied(targetPart, targetSocket, pin)) continue;
            const alignedQuaternion = preserveOrientation
              ? pin.getWorldQuaternion(new THREE.Quaternion())
              : targetPart.getWorldQuaternion(new THREE.Quaternion());
            const targetPosition = getComponentSnapPosition(
              targetPart,
              targetSocket,
              pinSocket,
              pin,
              alignedQuaternion
            );
            const rotatedSocket = new THREE.Vector3(pinSocket.x, pinSocket.y, pinSocket.z)
              .applyQuaternion(alignedQuaternion);
            const desiredWorldPosition = targetPosition.clone().sub(rotatedSocket);
            const distance = pinWorldPosition.distanceTo(desiredWorldPosition);
            const snapDistance = Math.max(maxDistance, targetPart.userData?.holesCount >= 11 ? 1.5 : 0);
            if (distance > snapDistance) continue;

            const pinBottomOffset = getPinBottomOffset(pinLocalBounds, alignedQuaternion);
            const wouldPenetrateGround = desiredWorldPosition.y + pinBottomOffset < -0.01;
            if (wouldPenetrateGround) continue;

            if (!nearest || distance < nearest.distance) {
              nearest = { pinSocket, targetPart, targetSocket, targetPosition, distance };
            }
          }
        }
      }

      return nearest;
    }

    function getPinLocalBounds(pin) {
      const bounds = new THREE.Box3();
      const inversePinMatrix = pin.matrixWorld.clone().invert();
      pin.traverse(child => {
        if (!child.isMesh || child.userData.isBadge || child.parent?.name === 'badges') return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        if (!child.geometry.boundingBox) return;
        const childToPin = inversePinMatrix.clone().multiply(child.matrixWorld);
        bounds.union(child.geometry.boundingBox.clone().applyMatrix4(childToPin));
      });
      return bounds;
    }

    function getPinBottomOffset(localBounds, quaternion) {
      let bottomOffset = Infinity;
      for (const x of [localBounds.min.x, localBounds.max.x]) {
        for (const y of [localBounds.min.y, localBounds.max.y]) {
          for (const z of [localBounds.min.z, localBounds.max.z]) {
            const worldOffset = new THREE.Vector3(x, y, z).applyQuaternion(quaternion);
            bottomOffset = Math.min(bottomOffset, worldOffset.y);
          }
        }
      }
      return bottomOffset;
    }

    function findNearestComponentSnap(part, maxDistance = 1.0) {
      const componentSockets = part.userData.holes || [];
      let nearest = null;

      for (const componentSocket of componentSockets) {
        const holePosition = getWorldSocketPosition(part, componentSocket);
        for (const pin of parts) {
          if (!pin.userData?.isPin || pin === part) continue;
          if (!canMagneticallyReattach(part, pin)) continue;
          if (!areSocketAxesParallel(part, pin)) continue;

          for (const pinSocket of pin.userData.holes || []) {
            if (isMagneticSocketOccupied(pin, pinSocket, part)) continue;
            if (isMagneticSocketOccupied(part, componentSocket, pin)) continue;
            const holePosition = getComponentSnapPosition(part, componentSocket, pinSocket, pin);
            const pinPosition = getWorldSocketPosition(pin, pinSocket);
            const distance = holePosition.distanceTo(pinPosition);
            const snapDistance = Math.max(maxDistance, part.userData?.holesCount >= 11 ? 1.5 : 0);
            if (distance <= snapDistance && (!nearest || distance < nearest.distance)) {
              nearest = { componentSocket, pin, pinSocket, pinPosition, distance };
            }
          }
        }
      }

      return nearest;
    }

    function isMagneticSocketOccupied(part, socket, exceptPart = null) {
      return joints.some(j => {
        if (!j.id.startsWith('magnetic_joint_')) return false;
        if ((j.partA === exceptPart && j.partB === part) ||
          (j.partB === exceptPart && j.partA === part)) return false;
        return (j.partA === part && socketsMatch(j.socketA, socket)) ||
          (j.partB === part && socketsMatch(j.socketB, socket));
      });
    }

    function socketsMatch(firstSocket, secondSocket) {
      if (firstSocket === secondSocket) return true;
      return Boolean(firstSocket && secondSocket &&
        firstSocket.index === secondSocket.index &&
        firstSocket.dir === secondSocket.dir);
    }

    function detachMagneticJoints(part) {
      const detached = joints.some(j => j.id.startsWith('magnetic_joint_') &&
        (j.partA === part || j.partB === part || j.pin === part));
      if (!detached) return;

      joints = joints.filter(j => !(j.id.startsWith('magnetic_joint_') &&
        (j.partA === part || j.partB === part || j.pin === part)));
      part.userData.magneticJointId = null;
      part.userData.magneticSnapped = false;
      updateJointsUI();
    }

    function detachMagneticSocket(part, socket) {
      const previousLength = joints.length;
      joints = joints.filter(j => {
        if (!j.id.startsWith('magnetic_joint_')) return true;
        const usesSocket = (j.partA === part && socketsMatch(j.socketA, socket)) ||
          (j.partB === part && socketsMatch(j.socketB, socket));
        return !usesSocket;
      });

      if (joints.length !== previousLength) updateJointsUI();
    }

    function detachPinJoints(pin) {
      detachMagneticJoints(pin);
    }

    function snapPinToHole(pin, snap) {
      if (!pin.userData.magneticPreserveOrientationDuringDrag) {
        pin.quaternion.copy(snap.targetPart.quaternion);
      }
      const rotatedSocket = new THREE.Vector3(
        snap.pinSocket.x,
        snap.pinSocket.y,
        snap.pinSocket.z
      ).applyQuaternion(pin.quaternion);
      const desiredWorldPosition = snap.targetPosition.clone().sub(rotatedSocket);

      if (pin.parent) {
        pin.position.copy(pin.parent.worldToLocal(desiredWorldPosition));
      } else {
        pin.position.copy(desiredWorldPosition);
      }
      pin.updateMatrixWorld(true);

      const currentJoint = joints.find(j => j.id.startsWith('magnetic_joint_') &&
        j.partA === pin && j.socketA === snap.pinSocket &&
        j.partB === snap.targetPart && j.socketB === snap.targetSocket);
      if (!currentJoint || currentJoint.partB !== snap.targetPart || currentJoint.socketB !== snap.targetSocket) {
        detachMagneticSocket(pin, snap.pinSocket);
        detachMagneticSocket(snap.targetPart, snap.targetSocket);
        const jointId = 'magnetic_joint_' + Date.now();
        joints.push({
          id: jointId,
          partA: pin,
          partB: snap.targetPart,
          socketA: snap.pinSocket,
          socketB: snap.targetSocket,
          pin
        });
        pin.userData.magneticJointId = jointId;
        pin.userData.magneticSnapped = true;
        updateJointsUI();
        showToast(`Đã hít chốt vào Lỗ #${snap.targetSocket.index}`);
      }
    }

    function snapComponentToPin(part, snap) {
      if (getMagneticPartners(snap.pin).length === 0) {
        snap.pin.quaternion.copy(part.quaternion);
      }
      const rotatedHole = getLocalComponentSnapPosition(snap.componentSocket, snap.pinSocket, part, snap.pin)
        .applyQuaternion(part.quaternion);
      const desiredWorldPosition = snap.pinPosition.clone().sub(rotatedHole);

      if (part.parent) {
        part.position.copy(part.parent.worldToLocal(desiredWorldPosition));
      } else {
        part.position.copy(desiredWorldPosition);
      }
      part.updateMatrixWorld(true);

      const currentJoint = joints.find(j => j.id.startsWith('magnetic_joint_') &&
        j.partA === snap.pin && j.socketA === snap.pinSocket &&
        j.partB === part && j.socketB === snap.componentSocket);
      if (!currentJoint || currentJoint.partA !== snap.pin || currentJoint.socketA !== snap.pinSocket) {
        detachMagneticSocket(part, snap.componentSocket);
        detachMagneticSocket(snap.pin, snap.pinSocket);
        const jointId = 'magnetic_joint_' + Date.now();
        joints.push({
          id: jointId,
          partA: snap.pin,
          partB: part,
          socketA: snap.pinSocket,
          socketB: snap.componentSocket,
          pin: snap.pin
        });
        part.userData.magneticJointId = jointId;
        part.userData.magneticSnapped = true;
        updateJointsUI();
        showToast(`Đã hít Lỗ #${snap.componentSocket.index} vào chốt`);
      }
    }

